package com.stracks.sports.running;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.OptionalInt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.activity.ActivityEntity;
import com.stracks.core.activity.CalorieEstimator;
import com.stracks.core.activity.GpsComputations;
import com.stracks.core.activity.SportPlugin;
import com.stracks.core.activity.SportStats;
import com.stracks.core.activity.SportTypeDescriptor;
import com.stracks.core.activity.TrackPointEntity;
import com.stracks.core.common.ApiException;
import com.stracks.core.user.AthleteProfile;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Module course à pied. Schéma metrics v1 :
 * { schemaVersion, avgPaceSecPerKm, elevationGainM, elevationLossM,
 *   splits: [{ km, paceSecPerKm }] }
 */
@ApplicationScoped
public class RunningPlugin implements SportPlugin {

    static final int SCHEMA_VERSION = 1;
    private static final double MAX_SPEED_KMH = 25.0; // au-delà : bruit GPS pour un coureur
    private static final JsonNodeFactory json = JsonNodeFactory.instance;

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("running", "Course à pied", true, SCHEMA_VERSION);
    }

    @Override
    public double maxGpsSpeedKmh() {
        return MAX_SPEED_KMH;
    }

    @Override
    public void validateMetrics(JsonNode metrics) {
        if (metrics == null || !metrics.isObject()) {
            throw ApiException.invalidMetrics("metrics doit être un objet JSON.");
        }
        for (Map.Entry<String, String> field : Map.of(
                "avgPaceSecPerKm", "number",
                "elevationGainM", "number",
                "elevationLossM", "number").entrySet()) {
            JsonNode v = metrics.get(field.getKey());
            if (v != null && (!v.isNumber() || v.asDouble() < 0)) {
                throw ApiException.invalidMetrics(field.getKey() + " doit être un nombre positif.");
            }
        }
        JsonNode splits = metrics.get("splits");
        if (splits != null && !splits.isArray()) {
            throw ApiException.invalidMetrics("splits doit être un tableau.");
        }
        Iterator<String> names = metrics.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!List.of("schemaVersion", "avgPaceSecPerKm", "elevationGainM", "elevationLossM", "splits")
                    .contains(name)) {
                throw ApiException.invalidMetrics("Champ inconnu pour running : " + name);
            }
        }
    }

    @Override
    public JsonNode computeFinalMetrics(ActivityEntity activity, List<TrackPointEntity> track) {
        GpsComputations.Result r = GpsComputations.compute(track, MAX_SPEED_KMH);

        ObjectNode metrics = json.objectNode();
        metrics.put("schemaVersion", SCHEMA_VERSION);
        metrics.put("elevationGainM", Math.round(r.elevationGainM()));
        metrics.put("elevationLossM", Math.round(r.elevationLossM()));

        Integer duration = activity.durationS;
        if (duration != null && duration > 0 && r.distanceM() > 50) {
            metrics.put("avgPaceSecPerKm", (int) Math.round(duration / (r.distanceM() / 1000.0)));
        }

        ArrayNode splits = metrics.putArray("splits");
        for (GpsComputations.Split split : r.splits()) {
            ObjectNode s = splits.addObject();
            s.put("km", split.km());
            s.put("paceSecPerKm", split.paceSecPerKm());
        }
        return metrics;
    }

    /**
     * MET de la course selon l'allure (Compendium of Physical Activities).
     * Table propre à ce sport : le socle n'a pas à la connaître.
     */
    private static double met(double speedKmh) {
        if (speedKmh < 6.4) {
            return 6.0;
        } else if (speedKmh < 8.0) {
            return 8.3;
        } else if (speedKmh < 9.7) {
            return 9.0;
        } else if (speedKmh < 11.3) {
            return 9.8;
        } else if (speedKmh < 12.9) {
            return 11.0;
        } else if (speedKmh < 14.5) {
            return 11.8;
        } else if (speedKmh < 16.1) {
            return 12.8;
        }
        return 14.5;
    }

    @Override
    public OptionalInt estimateCalories(ActivityEntity activity, List<TrackPointEntity> track,
            AthleteProfile athlete) {
        double distance = activity.distanceM != null
                ? activity.distanceM.doubleValue()
                : GpsComputations.compute(track, MAX_SPEED_KMH).distanceM();
        double speed = CalorieEstimator.averageSpeedKmh(distance, activity.durationS);
        if (speed <= 0) {
            return OptionalInt.empty();
        }
        return CalorieEstimator.estimate(met(speed), athlete, activity.durationS);
    }

    @Override
    public SportStats computeStats(List<ActivityEntity> activities) {
        return new SportStats(
                "running",
                "Course à pied",
                activities.size(),
                activities.stream().mapToLong(a -> a.durationS == null ? 0 : a.durationS).sum(),
                activities.stream().mapToDouble(a -> a.distanceM == null ? 0 : a.distanceM.doubleValue()).sum(),
                activities.stream().mapToDouble(a -> a.metrics != null && a.metrics.has("elevationGainM")
                        ? a.metrics.get("elevationGainM").asDouble() : 0).sum());
    }
}
