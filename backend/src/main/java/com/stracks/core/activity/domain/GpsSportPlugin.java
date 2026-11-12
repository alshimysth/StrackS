package com.stracks.core.activity.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.OptionalInt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.user.AthleteProfile;

/**
 * Base of every geolocated sport.
 *
 * <p>Running, walking, cycling and trail share nine tenths of their behaviour: the raw
 * track is filtered, the distance and the elevation come out of {@link GpsComputations},
 * the calories come from a MET read on the average speed, the stats sum distance and
 * elevation, and the longest distance is a record. Duplicating that in each module would
 * guarantee their divergence at the first retouch (lot H review).
 *
 * <p>What stays the module's: the plausibility ceiling, the MET table, the metrics it
 * adds on top of elevation (pace, speed, splits) and the schema that validates them.
 */
public abstract class GpsSportPlugin implements SportPlugin {

    protected static final JsonNodeFactory json = JsonNodeFactory.instance;

    /** MET matching this sport at the given average speed (Compendium of Physical Activities). */
    protected abstract double met(double speedKmh);

    /**
     * Schema of the metrics this sport writes. The base declares what every GPS sport has;
     * the module adds its own fields.
     */
    protected MetricsSchema schema() {
        return MetricsSchema.object()
                .positiveNumber("elevationGainM")
                .positiveNumber("elevationLossM");
    }

    /**
     * Sport-specific metrics, written on top of the elevation. {@code result} is already
     * filtered and computed; {@code activity.durationS} is the active duration.
     */
    protected abstract void addSportMetrics(ObjectNode metrics, ActivityEntity activity,
            GpsComputations.Result result);

    @Override
    public final void validateMetrics(JsonNode metrics) {
        schema().validate(metrics);
    }

    @Override
    public final FinalMetrics complete(ActivityEntity activity, List<TrackPointEntity> track) {
        GpsComputations.Result result = GpsComputations.compute(track, maxGpsSpeedKmh());

        ObjectNode metrics = json.objectNode();
        metrics.put("schemaVersion", descriptor().schemaVersion());
        metrics.put("elevationGainM", Math.round(result.elevationGainM()));
        metrics.put("elevationLossM", Math.round(result.elevationLossM()));
        addSportMetrics(metrics, activity, result);

        // Without a track there is no distance, not a zero: a session whose upload failed
        // must not read as "0,00 km".
        return track.isEmpty()
                ? FinalMetrics.of(metrics)
                : FinalMetrics.withDistance(metrics, result.distanceM());
    }

    @Override
    public OptionalInt estimateCalories(ActivityEntity activity, List<TrackPointEntity> track,
            AthleteProfile athlete) {
        double distance = activity.distanceM != null
                ? activity.distanceM.doubleValue()
                : GpsComputations.compute(track, maxGpsSpeedKmh()).distanceM();
        double speed = CalorieEstimator.averageSpeedKmh(distance, activity.durationS);
        if (speed <= 0) {
            return OptionalInt.empty();
        }
        return CalorieEstimator.estimate(met(speed), athlete, activity.durationS);
    }

    /**
     * The longest distance, read from the column recomputed by the server at stop, never
     * from a value sent by the client. Modules add their own (biggest climb for trail).
     */
    @Override
    public List<PersonalRecordMetric> personalRecordMetrics() {
        List<PersonalRecordMetric> records = new ArrayList<>();
        records.add(PersonalRecordMetric.LONGEST_DISTANCE);
        records.addAll(extraRecords());
        return List.copyOf(records);
    }

    /** Records beyond the longest distance. None by default. */
    protected List<PersonalRecordMetric> extraRecords() {
        return List.of();
    }

    @Override
    public SportStats computeStats(List<ActivityEntity> activities) {
        return SportStats.of(descriptor(), activities, GpsComputations.gpsTotals(activities));
    }

    /** Average speed in km/h for the session, rounded to one decimal; 0 when unknown. */
    protected static double roundedSpeedKmh(double distanceM, Integer durationS) {
        double speed = CalorieEstimator.averageSpeedKmh(distanceM, durationS);
        return Math.round(speed * 10.0) / 10.0;
    }

    /** Average pace in s/km; empty when the session is too short to mean anything. */
    protected static OptionalInt averagePaceSecPerKm(double distanceM, Integer durationS) {
        if (durationS == null || durationS <= 0 || distanceM <= 50) {
            return OptionalInt.empty();
        }
        return OptionalInt.of((int) Math.round(durationS / (distanceM / 1000.0)));
    }
}
