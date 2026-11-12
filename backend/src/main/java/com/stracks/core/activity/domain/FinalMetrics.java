package com.stracks.core.activity.domain;

import java.util.Objects;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * What a sport module hands back when a session closes: the completed {@code metrics}
 * JSONB and, when the sport measures one, the distance to write in the core column.
 *
 * <p>The distance is a core column because every screen (history, stats chart) reads it
 * without opening the JSONB; but only the module knows whether its sport has one and
 * where it comes from (GPS track, treadmill display, nothing at all).
 *
 * @param metrics   completed metrics, never null
 * @param distanceM distance in metres, or {@code null} when the sport has none
 */
public record FinalMetrics(JsonNode metrics, Double distanceM) {

    public FinalMetrics {
        Objects.requireNonNull(metrics, "metrics");
        if (distanceM != null && (distanceM.isNaN() || distanceM < 0)) {
            throw new IllegalArgumentException("distanceM must be positive or null");
        }
    }

    public static FinalMetrics of(JsonNode metrics) {
        return new FinalMetrics(metrics, null);
    }

    public static FinalMetrics withDistance(JsonNode metrics, double distanceM) {
        return new FinalMetrics(metrics, distanceM);
    }
}
