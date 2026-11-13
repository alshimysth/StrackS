package com.stracks.core.activity.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.OptionalInt;
import java.util.UUID;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.stracks.core.activity.application.ActivityCommands.ListQuery;
import com.stracks.core.activity.application.ActivityCommands.Start;
import com.stracks.core.activity.application.ActivityCommands.Stop;
import com.stracks.core.activity.application.ActivityCommands.Update;
import com.stracks.core.activity.application.ActivityRepository.ActivityPage;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.FinalMetrics;
import com.stracks.core.activity.domain.SportPlugin;
import com.stracks.core.activity.domain.TrackPointEntity;
import com.stracks.core.common.ApiException;
import com.stracks.core.user.AthleteProfile;
import com.stracks.core.user.PreferencesService;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

/**
 * Use cases of the activity lifecycle. Knows no sport: validation and metric computation
 * are delegated to the plugin of the activity's sport type.
 *
 * <p>Every use case is scoped to the caller's user id. Another user's activity answers
 * "not found", never "forbidden": not even its existence is revealed (anti-IDOR).
 */
@ApplicationScoped
public class ActivityService {

    @Inject
    SportRegistry registry;

    @Inject
    ActivityRepository activities;

    @Inject
    TrackPointRepository trackPoints;

    @Inject
    PreferencesService preferences;

    // --- Lifecycle ---

    @Transactional
    public ActivityEntity start(UUID userId, Start command) {
        SportPlugin plugin = registry.require(command.sportType()); // 422 if unknown
        ActivityEntity activity = new ActivityEntity();
        activity.userId = userId;
        activity.sportType = plugin.descriptor().code();
        activity.startedAt = command.startedAt();
        activity.metrics = JsonNodeFactory.instance.objectNode();
        activities.persist(activity);
        return activity;
    }

    @Transactional
    public ActivityEntity pause(UUID userId, UUID activityId) {
        ActivityEntity activity = owned(userId, activityId);
        if (!activity.isInProgress()) {
            throw ApiException.invalidTransition(activity.status, "pause");
        }
        activity.status = ActivityEntity.STATUS_PAUSED;
        activity.pausedAt = Instant.now();
        return activity;
    }

    @Transactional
    public ActivityEntity resume(UUID userId, UUID activityId) {
        ActivityEntity activity = owned(userId, activityId);
        if (!activity.isPaused()) {
            throw ApiException.invalidTransition(activity.status, "resume");
        }
        activity.pausedTotalS += (int) Duration.between(activity.pausedAt, Instant.now()).toSeconds();
        activity.pausedAt = null;
        activity.status = ActivityEntity.STATUS_IN_PROGRESS;
        return activity;
    }

    @Transactional
    public ActivityEntity stop(UUID userId, UUID activityId, Stop command) {
        ActivityEntity activity = owned(userId, activityId);
        if (activity.isCompleted()) {
            throw ApiException.invalidTransition(activity.status, "stop");
        }
        SportPlugin plugin = registry.require(activity.sportType);
        if (command.metrics() != null) {
            plugin.validateMetrics(command.metrics());
            activity.metrics = command.metrics();
        }

        // A pause still open when stopping: close it
        if (activity.isPaused() && activity.pausedAt != null) {
            activity.pausedTotalS += (int) Duration.between(activity.pausedAt, command.endedAt()).toSeconds();
            activity.pausedAt = null;
        }

        activity.endedAt = command.endedAt();
        activity.durationS = command.durationS() != null
                ? command.durationS()
                : Math.max(0, (int) Duration.between(activity.startedAt, activity.endedAt).toSeconds()
                        - activity.pausedTotalS);
        activity.notes = command.notes() != null ? command.notes() : activity.notes;

        finish(plugin, activity, trackOf(plugin, activity), userId);
        activity.status = ActivityEntity.STATUS_COMPLETED;
        return activity;
    }

    @Transactional
    public void delete(UUID userId, UUID activityId) {
        activities.delete(owned(userId, activityId)); // SQL cascade on track_points
    }

    // --- History ---

    public ActivityPage list(UUID userId, ListQuery query) {
        return activities.findPage(userId, query.sport(), query.from(), query.to(), query.page(), query.size());
    }

    public ActivityEntity get(UUID userId, UUID activityId) {
        return owned(userId, activityId);
    }

    @Transactional
    public ActivityEntity update(UUID userId, UUID activityId, Update command) {
        ActivityEntity activity = owned(userId, activityId);
        // Empty string = explicit clear; absent = field untouched. The title is trimmed so
        // that whitespace input doesn't produce a "present but empty" title, which the
        // display would treat as a title with nothing to show.
        if (command.title() != null) {
            String trimmed = command.title().trim();
            activity.title = trimmed.isEmpty() ? null : trimmed;
        }
        if (command.notes() != null) {
            activity.notes = command.notes();
        }
        if (command.metrics() != null) {
            SportPlugin plugin = registry.require(activity.sportType);
            plugin.validateMetrics(command.metrics());
            activity.metrics = command.metrics();
            // Edited after the fact (a corrected score, a forgotten route): the derived
            // figures and the calories are recomputed exactly as at stop, so an edit can
            // never leave a total that contradicts its detail.
            if (activity.isCompleted()) {
                finish(plugin, activity, trackOf(plugin, activity), userId);
            }
        }
        return activity;
    }

    // --- GPS track ---

    @Transactional
    public int uploadTrackPoints(UUID userId, UUID activityId, List<TrackPointEntity> points) {
        ActivityEntity activity = owned(userId, activityId);
        for (TrackPointEntity p : points) {
            p.activityId = activity.id;
        }
        int inserted = trackPoints.insertIgnoringDuplicates(points);
        // A track arriving after the stop (offline session closed first, upload retried
        // later): the completed activity must not keep showing no distance while its
        // track exists. Only a batch that added something triggers the recomputation, so
        // a replayed batch stays a no-op.
        if (inserted > 0 && activity.isCompleted()) {
            SportPlugin plugin = registry.require(activity.sportType);
            if (plugin.descriptor().usesGps()) {
                finish(plugin, activity, trackPoints.findByActivity(activity.id), userId);
            }
        }
        return inserted;
    }

    public List<TrackPointEntity> trackPoints(UUID userId, UUID activityId) {
        return trackPoints.findByActivity(owned(userId, activityId).id);
    }

    // --- Internals ---

    private ActivityEntity owned(UUID userId, UUID activityId) {
        return activities.findOwned(activityId, userId)
                .orElseThrow(() -> ApiException.notFound("Activité"));
    }

    /** A timed sport has no track: no query is issued for it. */
    private List<TrackPointEntity> trackOf(SportPlugin plugin, ActivityEntity activity) {
        return plugin.descriptor().usesGps() ? trackPoints.findByActivity(activity.id) : List.of();
    }

    /**
     * The server's metrics are the source of truth: whatever the client sent is completed
     * here, then the calories follow. The same path serves the stop, an edit after the
     * fact and a late track upload, so the three can never disagree.
     *
     * <p>Calories come AFTER the distance, which the average speed depends on. The core
     * only passes the athlete profile along; the sport module is the one that knows what
     * its effort costs. Without an estimate, the previous value is cleared rather than
     * kept: a stale figure is a made-up one (#33).
     */
    private void finish(SportPlugin plugin, ActivityEntity activity, List<TrackPointEntity> track, UUID userId) {
        FinalMetrics completion = plugin.complete(activity, track);
        activity.metrics = completion.metrics();
        activity.distanceM = completion.distanceM() == null
                ? null
                : BigDecimal.valueOf(completion.distanceM()).setScale(1, RoundingMode.HALF_UP);
        AthleteProfile athlete = preferences.athleteProfileOf(userId);
        OptionalInt calories = plugin.estimateCalories(activity, track, athlete);
        activity.calories = calories.isPresent() ? calories.getAsInt() : null;
    }
}
