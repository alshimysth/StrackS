package com.sporttracker.sports.walking;

import java.util.Iterator;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sporttracker.core.activity.ActivityEntity;
import com.sporttracker.core.activity.GpsComputations;
import com.sporttracker.core.activity.SportPlugin;
import com.sporttracker.core.activity.SportStats;
import com.sporttracker.core.activity.SportTypeDescriptor;
import com.sporttracker.core.activity.TrackPointEntity;
import com.sporttracker.core.common.ApiException;

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
