package com.stracks.core.activity;

import java.util.List;
import java.util.OptionalInt;

import com.fasterxml.jackson.databind.JsonNode;
import com.stracks.core.user.AthleteProfile;

/**
 * Contract of a sport module. The core knows no sport: all sport-specific logic goes
 * through an implementation of this interface, discovered by CDI and indexed in
 * {@link SportRegistry}. Adding a sport = adding a class under sports/<code>/, with no
 * file of core/ modified.
 */
public interface SportPlugin {

    /** Sport descriptor (code, label, usesGps, metrics schema version). */
    SportTypeDescriptor descriptor();

    /** Validates the metrics JSONB of an activity of this sport. Throws a 422 otherwise. */
    void validateMetrics(JsonNode metrics);

    /**
     * Computes/completes the metrics when an activity is closed
     * (e.g. running: average pace, elevation gain/loss from the track_points).
     */
    JsonNode computeFinalMetrics(ActivityEntity activity, List<TrackPointEntity> track);

    /** Aggregates this sport's stats over a list of activities (for /stats). */
    SportStats computeStats(List<ActivityEntity> activities);

    /**
     * Estimates the energy expenditure of the activity, in kilocalories.
     *
     * <p>The core doesn't know what an effort costs: only the sport module knows the MET
     * matching its own. A sport that can't estimate returns nothing: {@code
     * activities.calories} then stays {@code null} and the UI shows no value rather than
     * a made-up number.
     *
     * @param athlete athlete profile, possibly empty (optional fields)
     */
    default OptionalInt estimateCalories(ActivityEntity activity, List<TrackPointEntity> track,
            AthleteProfile athlete) {
        return OptionalInt.empty();
    }

    /**
     * Measures for which this sport keeps a personal record (#61), on top of the duration
     * the core tracks for every sport. None by default: a new sport has nothing to write
     * for its duration records to work.
     */
    default List<PersonalRecordMetric> personalRecordMetrics() {
        return List.of();
    }

    /**
     * Maximum speed (km/h) for this sport's GPS plausibility filter.
     * Ignored when usesGps() is false.
     */
    default double maxGpsSpeedKmh() {
        return 30.0;
    }
}
