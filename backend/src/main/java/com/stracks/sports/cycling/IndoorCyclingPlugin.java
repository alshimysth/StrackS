package com.stracks.sports.cycling;

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
 * Indoor cycling (trainer, spin bike). The rider reports what the machine displays:
 * distance, average power, cadence. Power is the best calorie predictor when known.
 *
 * Metrics schema v1:
 * { schemaVersion, distanceM, avgPowerW, avgCadenceRpm, avgSpeedKmh (derived) }
 */
@ApplicationScoped
public class IndoorCyclingPlugin extends TimerSportPlugin {

    static final int SCHEMA_VERSION = 1;
    /** Compendium 01200, stationary bicycling general. */
    private static final double DEFAULT_MET = 7.0;

    private static final MetricsSchema SCHEMA = MetricsSchema.object()
            .number("distanceM", 0, 500_000)
            .number("avgPowerW", 0, 2000)
            .number("avgCadenceRpm", 0, 250)
            .computed("avgSpeedKmh");

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("indoor_cycling", "Vélo d'intérieur", CyclingFamily.FAMILY, TrackingMode.TIMER, SCHEMA_VERSION);
    }

    @Override
    protected MetricsSchema schema() {
        return SCHEMA;
    }

    @Override
    protected void derive(ObjectNode metrics, ActivityEntity activity) {
        double distance = reportedDistance(metrics);
        if (distance > 50 && activity.durationS != null && activity.durationS > 0) {
            metrics.put("avgSpeedKmh", Math.round(CalorieEstimator.averageSpeedKmh(distance, activity.durationS) * 10.0) / 10.0);
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

    /**
     * Stationary cycling MET by power (Compendium 01015 to 01070). With a power meter the
     * figure is far more reliable than a speed the trainer invents.
     */
    private static double metByPower(double watts) {
        if (watts < 50) {
            return 3.5;
        } else if (watts < 100) {
            return 6.8;
        } else if (watts < 160) {
            return 8.8;
        } else if (watts < 200) {
            return 11.0;
        } else if (watts < 270) {
            return 14.0;
        }
        return 16.8;
    }

    @Override
    public OptionalInt estimateCalories(ActivityEntity activity, List<TrackPointEntity> track,
            AthleteProfile athlete) {
        double met = DEFAULT_MET;
        if (activity.metrics != null && activity.metrics.hasNonNull("avgPowerW")) {
            met = metByPower(activity.metrics.get("avgPowerW").asDouble());
        } else if (activity.distanceM != null) {
            double speed = CalorieEstimator.averageSpeedKmh(activity.distanceM.doubleValue(), activity.durationS);
            if (speed > 0) {
                met = CyclingFamily.met(speed);
            }
        }
        return CalorieEstimator.estimate(met, athlete, activity.durationS);
    }

    @Override
    public List<PersonalRecordMetric> personalRecordMetrics() {
        return List.of(PersonalRecordMetric.LONGEST_DISTANCE,
                PersonalRecordMetric.ofMetric("avgPowerW", "Meilleure puissance moyenne", "W"));
    }

    @Override
    public SportStats computeStats(List<ActivityEntity> activities) {
        return SportStats.of(descriptor(), activities, GpsComputations.distanceTotals(activities));
    }
}
