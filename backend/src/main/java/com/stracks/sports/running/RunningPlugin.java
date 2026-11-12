package com.stracks.sports.running;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.GpsComputations;
import com.stracks.core.activity.domain.GpsSportPlugin;
import com.stracks.core.activity.domain.MetricsSchema;
import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Road running. Metrics schema v1:
 * { schemaVersion, avgPaceSecPerKm, elevationGainM, elevationLossM,
 *   splits: [{ km, paceSecPerKm }] }
 */
@ApplicationScoped
public class RunningPlugin extends GpsSportPlugin {

    static final int SCHEMA_VERSION = 1;
    /** Beyond: GPS noise for a runner. Mirrored by the mobile module. */
    static final double MAX_SPEED_KMH = 25.0;

    private static final MetricsSchema SPLIT = MetricsSchema.object()
            .integer("km", 1, 1000)
            .integer("paceSecPerKm", 1, 7200)
            .required("km", "paceSecPerKm");

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("running", "Course à pied", RunningFamily.FAMILY, TrackingMode.GPS, SCHEMA_VERSION);
    }

    @Override
    public double maxGpsSpeedKmh() {
        return MAX_SPEED_KMH;
    }

    @Override
    protected double met(double speedKmh) {
        return RunningFamily.met(speedKmh);
    }

    @Override
    protected MetricsSchema schema() {
        return super.schema()
                .positiveNumber("avgPaceSecPerKm")
                .array("splits", SPLIT, 1000);
    }

    @Override
    protected void addSportMetrics(ObjectNode metrics, ActivityEntity activity, GpsComputations.Result r) {
        averagePaceSecPerKm(r.distanceM(), activity.durationS)
                .ifPresent(pace -> metrics.put("avgPaceSecPerKm", pace));
        ArrayNode splits = metrics.putArray("splits");
        for (GpsComputations.Split split : r.splits()) {
            ObjectNode s = splits.addObject();
            s.put("km", split.km());
            s.put("paceSecPerKm", split.paceSecPerKm());
        }
    }
}
