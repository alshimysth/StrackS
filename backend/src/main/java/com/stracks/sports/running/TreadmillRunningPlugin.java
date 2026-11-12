package com.stracks.sports.running;

import java.util.List;
import java.util.OptionalInt;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.CalorieEstimator;
import com.stracks.core.activity.domain.GpsComputations;
import com.stracks.core.activity.domain.MetricsSchema;
import com.stracks.core.activity.domain.PersonalRecordMetric;
import com.stracks.core.activity.domain.SportStats;
import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TimerSportPlugin;
import com.stracks.core.activity.domain.TrackPointEntity;
import com.stracks.core.activity.domain.TrackingMode;
import com.stracks.core.user.AthleteProfile;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Treadmill. No GPS indoors: the runner reads the distance on the machine's display and
 * reports it; the server derives the pace from it and the active duration.
 *
 * Metrics schema v1: { schemaVersion, distanceM, inclinePct, avgPaceSecPerKm (derived) }
 */
@ApplicationScoped
public class TreadmillRunningPlugin extends TimerSportPlugin {

    static final int SCHEMA_VERSION = 1;
    /** Compendium 12030, running 8 km/h: the figure used when no distance was reported. */
    private static final double DEFAULT_MET = 8.3;

    private static final MetricsSchema SCHEMA = MetricsSchema.object()
            .number("distanceM", 0, 200_000)
            .number("inclinePct", 0, 40)
            .computed("avgPaceSecPerKm");

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("treadmill_running", "Tapis de course", RunningFamily.FAMILY, TrackingMode.TIMER, SCHEMA_VERSION);
    }

    @Override
    protected MetricsSchema schema() {
        return SCHEMA;
    }

    @Override
    protected void derive(ObjectNode metrics, ActivityEntity activity) {
        double distance = reportedDistance(metrics);
        if (distance > 50 && activity.durationS != null && activity.durationS > 0) {
            metrics.put("avgPaceSecPerKm", (int) Math.round(activity.durationS / (distance / 1000.0)));
        }
    }

    @Override
    protected Double distanceM(ObjectNode metrics) {
        double distance = reportedDistance(metrics);
        return distance > 0 ? distance : null;
    }

    private static double reportedDistance(ObjectNode metrics) {
        return metrics.hasNonNull("distanceM") ? metrics.get("distanceM").asDouble() : 0;
    }

    @Override
    public OptionalInt estimateCalories(ActivityEntity activity, List<TrackPointEntity> track,
            AthleteProfile athlete) {
        double distance = activity.distanceM != null ? activity.distanceM.doubleValue() : 0;
        double speed = CalorieEstimator.averageSpeedKmh(distance, activity.durationS);
        double met = speed > 0 ? RunningFamily.met(speed) : DEFAULT_MET;
        // Compendium: each percent of incline adds roughly 0.5 MET at running speeds.
        if (activity.metrics != null && activity.metrics.hasNonNull("inclinePct")) {
            met += 0.5 * activity.metrics.get("inclinePct").asDouble();
        }
        return CalorieEstimator.estimate(met, athlete, activity.durationS);
    }

    @Override
    public List<PersonalRecordMetric> personalRecordMetrics() {
        return List.of(PersonalRecordMetric.LONGEST_DISTANCE);
    }

    @Override
    public SportStats computeStats(List<ActivityEntity> activities) {
        return SportStats.of(descriptor(), activities, GpsComputations.distanceTotals(activities));
    }
}
