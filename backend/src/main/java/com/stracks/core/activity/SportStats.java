package com.stracks.core.activity;

import java.util.Map;

/**
 * Aggregates of one sport over a period.
 *
 * <p>The core only knows what <em>every</em> activity has: a session count and a
 * duration. Everything else (distance, elevation, weight lifted, pool lengths) is named
 * by the plugin in {@code totals}. Listing those metrics as fields of this record would
 * force a change to {@code core/} for each new sport, which the plugin pattern forbids;
 * and the core would end up summing elevation for an indoor sport that has none (#46).
 *
 * <p>Key conventions for {@code totals}: camelCase, unit as suffix
 * ("distanceM", "elevationGainM"). Two sports measuring the same quantity use the
 * <strong>same key</strong>: that is precisely what lets the core add them up without
 * understanding what it adds.
 */
public record SportStats(
        String sportType,
        String label,
        int sessions,
        long totalDurationS,
        Map<String, Double> totals) {

    public SportStats {
        totals = totals == null ? Map.of() : Map.copyOf(totals);
    }
}
