package com.stracks.sports.walking;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.GpsComputations;
import com.stracks.core.activity.domain.GpsSportPlugin;
import com.stracks.core.activity.domain.MetricsSchema;
import com.stracks.core.activity.domain.SportFamily;
import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Walking module. Reuses core's shared GPS engine, no copy-paste.
 * Metrics schema v1: { schemaVersion, avgSpeedKmh, elevationGainM, elevationLossM }
 * (average speed rather than pace: a walker's mental model).
 */
@ApplicationScoped
public class WalkingPlugin extends GpsSportPlugin {

    static final SportFamily FAMILY = new SportFamily("walking", "Marche");
    static final int SCHEMA_VERSION = 1;
    /** Beyond: GPS noise for a walker. Mirrored by the mobile module. */
    static final double MAX_SPEED_KMH = 12.0;

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("walking", "Marche", FAMILY, TrackingMode.GPS, SCHEMA_VERSION);
    }

    @Override
    public double maxGpsSpeedKmh() {
        return MAX_SPEED_KMH;
    }

    /**
     * Walking MET by speed (Compendium of Physical Activities).
     * Walking fast costs much less than running slowly at the same speed, hence a table of
     * its own.
     */
    @Override
    protected double met(double speedKmh) {
        if (speedKmh < 3.2) {
            return 2.0;
        } else if (speedKmh < 4.0) {
            return 2.8;
        } else if (speedKmh < 4.8) {
            return 3.5;
        } else if (speedKmh < 5.6) {
            return 4.3;
        } else if (speedKmh < 6.4) {
            return 5.0;
        }
        return 7.0;
    }

    @Override
    protected MetricsSchema schema() {
        return super.schema().positiveNumber("avgSpeedKmh");
    }

    @Override
    protected void addSportMetrics(ObjectNode metrics, ActivityEntity activity, GpsComputations.Result r) {
        if (r.distanceM() > 50) {
            double speed = roundedSpeedKmh(r.distanceM(), activity.durationS);
            if (speed > 0) {
                metrics.put("avgSpeedKmh", speed);
            }
        }
    }
}
