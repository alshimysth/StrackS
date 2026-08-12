package com.stracks.sports.walking;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.OptionalInt;

import com.fasterxml.jackson.databind.JsonNode;
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
 * Module marche. Réutilise le moteur GPS partagé de core — zéro copier-coller.
 * Schéma metrics v1 : { schemaVersion, avgSpeedKmh, elevationGainM, elevationLossM }
 * (vitesse moyenne plutôt qu'allure : mental model marcheur).
 */
@ApplicationScoped
public class WalkingPlugin implements SportPlugin {

    static final int SCHEMA_VERSION = 1;
    private static final double MAX_SPEED_KMH = 12.0; // au-delà : bruit GPS pour un marcheur
    private static final JsonNodeFactory json = JsonNodeFactory.instance;

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("walking", "Marche", true, SCHEMA_VERSION);
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
                "avgSpeedKmh", "number",
                "elevationGainM", "number",
                "elevationLossM", "number").entrySet()) {
            JsonNode v = metrics.get(field.getKey());
            if (v != null && (!v.isNumber() || v.asDouble() < 0)) {
                throw ApiException.invalidMetrics(field.getKey() + " doit être un nombre positif.");
            }
        }
        Iterator<String> names = metrics.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!List.of("schemaVersion", "avgSpeedKmh", "elevationGainM", "elevationLossM").contains(name)) {
                throw ApiException.invalidMetrics("Champ inconnu pour walking : " + name);
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
            double hours = duration / 3600.0;
            metrics.put("avgSpeedKmh", Math.round((r.distanceM() / 1000.0) / hours * 10.0) / 10.0);
        }
        return metrics;
    }

    /**
     * MET de la marche selon la vitesse (Compendium of Physical Activities).
     * Table propre à ce sport : marcher vite coûte bien moins que courir
     * doucement à la même vitesse, d'où deux tables distinctes.
     */
    private static double met(double speedKmh) {
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
                "walking",
                "Marche",
                activities.size(),
                activities.stream().mapToLong(a -> a.durationS == null ? 0 : a.durationS).sum(),
                activities.stream().mapToDouble(a -> a.distanceM == null ? 0 : a.distanceM.doubleValue()).sum(),
                activities.stream().mapToDouble(a -> a.metrics != null && a.metrics.has("elevationGainM")
                        ? a.metrics.get("elevationGainM").asDouble() : 0).sum());
    }
}
