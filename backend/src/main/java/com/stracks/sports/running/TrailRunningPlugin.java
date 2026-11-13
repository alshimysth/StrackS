package com.stracks.sports.running;

import java.util.List;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.GpsComputations;
import com.stracks.core.activity.domain.GpsSportPlugin;
import com.stracks.core.activity.domain.MetricsSchema;
import com.stracks.core.activity.domain.PersonalRecordMetric;
import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Trail running. Same engine as road running, a different mental model: the climb is the
 * figure a trail runner reads first, so the module adds the elevation gain per kilometre
 * and keeps a record for the biggest climb.
 *
 * Metrics schema v1:
 * { schemaVersion, avgPaceSecPerKm, elevationGainM, elevationLossM, elevationGainPerKmM,
 *   splits: [{ km, paceSecPerKm }] }
 */
@ApplicationScoped
public class TrailRunningPlugin extends GpsSportPlugin {

    static final int SCHEMA_VERSION = 1;
    /** Steep descents go faster than road running; beyond this it's noise. */
    static final double MAX_SPEED_KMH = 30.0;
    /** Compendium 12150, cross-country running: the floor whatever the (slow) pace. */
    private static final double MIN_MET = 9.0;

    private static final MetricsSchema SPLIT = MetricsSchema.object()
            .integer("km", 1, 1000)
            .integer("paceSecPerKm", 1, 7200)
            .required("km", "paceSecPerKm");

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("trail_running", "Trail", RunningFamily.FAMILY, TrackingMode.GPS, SCHEMA_VERSION);
    }

    @Override
    public double maxGpsSpeedKmh() {
        return MAX_SPEED_KMH;
    }

    /** Uphill effort isn't visible in the speed: the road table underestimates a slow climb. */
    @Override
    protected double met(double speedKmh) {
        return Math.max(MIN_MET, RunningFamily.met(speedKmh));
    }

    @Override
    protected MetricsSchema schema() {
        return super.schema()
                .positiveNumber("avgPaceSecPerKm")
                .positiveNumber("elevationGainPerKmM")
                .array("splits", SPLIT, 1000);
    }

    @Override
    protected void addSportMetrics(ObjectNode metrics, ActivityEntity activity, GpsComputations.Result r) {
        averagePaceSecPerKm(r.distanceM(), activity.durationS)
                .ifPresent(pace -> metrics.put("avgPaceSecPerKm", pace));
        if (r.distanceM() >= 1000) {
            metrics.put("elevationGainPerKmM", Math.round(r.elevationGainM() / (r.distanceM() / 1000.0)));
        }
        ArrayNode splits = metrics.putArray("splits");
        for (GpsComputations.Split split : r.splits()) {
            ObjectNode s = splits.addObject();
            s.put("km", split.km());
            s.put("paceSecPerKm", split.paceSecPerKm());
        }
    }

    @Override
    protected List<PersonalRecordMetric> extraRecords() {
        return List.of(PersonalRecordMetric.ofMetric("elevationGainM", "Plus gros dénivelé", "m"));
    }
}
