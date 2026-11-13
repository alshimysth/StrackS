package com.stracks.core.activity.domain;

import java.util.List;
import java.util.OptionalInt;

import com.fasterxml.jackson.databind.JsonNode;
import com.stracks.core.user.AthleteProfile;

/**
 * Contract of a sport module. The core knows no sport: all sport-specific logic goes
 * through an implementation of this interface, discovered by CDI and indexed in
 * {@code SportRegistry}. Adding a sport = adding a class under sports/<family>/, with no
 * file of core/ modified.
 *
 * <p>Two base classes cover the common cases so that a module only writes what is really
 * its own: {@link GpsSportPlugin} for geolocated sports and {@link TimerSportPlugin} for
 * timed sports whose content the client reports.
 */
public interface SportPlugin {

    /** Sport descriptor (code, label, family, tracking mode, metrics schema version). */
    SportTypeDescriptor descriptor();

    /**
     * Validates a {@code metrics} JSONB sent by the client (at stop or on edit). Throws a
     * 422 otherwise. Unknown keys are rejected: silently accepting a typo would create a
     * metric nobody ever reads.
     */
    void validateMetrics(JsonNode metrics);

    /**
     * Completes the activity when it closes.
     *
     * <p>A geolocated sport recomputes everything from the raw track (source of truth);
     * a timed sport derives its totals from what the client reported, already validated
     * and stored in {@code activity.metrics}. The result also says whether the sport has
     * a distance to write in the core column.
     */
    FinalMetrics complete(ActivityEntity activity, List<TrackPointEntity> track);

    /** Aggregates this sport's stats over a list of completed activities (for /stats). */
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
     * Ignored when the tracking mode isn't GPS.
     */
    default double maxGpsSpeedKmh() {
        return 30.0;
    }
}
