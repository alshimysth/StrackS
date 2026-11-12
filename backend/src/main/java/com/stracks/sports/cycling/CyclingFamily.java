package com.stracks.sports.cycling;

import java.util.List;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.CalorieEstimator;
import com.stracks.core.activity.domain.GpsComputations;
import com.stracks.core.activity.domain.MetricsSchema;
import com.stracks.core.activity.domain.PersonalRecordMetric;
import com.stracks.core.activity.domain.SportFamily;

/** What the cycling modules share: the family, the MET table, the outdoor metrics. */
final class CyclingFamily {

    static final SportFamily FAMILY = new SportFamily("cycling", "Vélo");

    private CyclingFamily() {
    }

    /** Cycling MET by speed (Compendium of Physical Activities, codes 01015 to 01050). */
    static double met(double speedKmh) {
        if (speedKmh < 16.0) {
            return 4.0;
        } else if (speedKmh < 19.0) {
            return 6.8;
        } else if (speedKmh < 22.5) {
            return 8.0;
        } else if (speedKmh < 25.5) {
            return 10.0;
        } else if (speedKmh < 30.5) {
            return 12.0;
        }
        return 15.8;
    }

    /** Outdoor schema: { avgSpeedKmh, maxSpeedKmh } on top of the elevation. */
    static MetricsSchema outdoorSchema(MetricsSchema base) {
        return base.positiveNumber("avgSpeedKmh").positiveNumber("maxSpeedKmh");
    }

    /** Average and top speed, rounded to one decimal, when the ride is long enough to mean anything. */
    static void addOutdoorMetrics(ObjectNode metrics, ActivityEntity activity, GpsComputations.Result r) {
        if (r.distanceM() <= 50) {
            return;
        }
        double speed = Math.round(CalorieEstimator.averageSpeedKmh(r.distanceM(), activity.durationS) * 10.0) / 10.0;
        if (speed > 0) {
            metrics.put("avgSpeedKmh", speed);
        }
        if (r.maxSpeedMs() > 0) {
            metrics.put("maxSpeedKmh", Math.round(r.maxSpeedMs() * 3.6 * 10.0) / 10.0);
        }
    }

    /** Records a cyclist reads: the biggest climb, on top of the longest distance. */
    static List<PersonalRecordMetric> outdoorRecords() {
        return List.of(PersonalRecordMetric.ofMetric("elevationGainM", "Plus gros dénivelé", "m"));
    }
}
