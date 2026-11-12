package com.stracks.core.activity.domain;

import java.util.List;
import java.util.Map;

/**
 * Aggregates of one sport over a period.
 *
 * <p>The core only knows what <em>every</em> activity has: a session count, a duration
 * and the calories it stores in a core column. Everything else (distance, elevation,
 * routes sent, sets won) is named by the plugin in {@code totals}. Listing those metrics
 * as fields of this record would force a change to {@code core/} for each new sport,
 * which the plugin pattern forbids; and the core would end up summing elevation for an
 * indoor sport that has none (#46).
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
        int calories,
        Map<String, Double> totals) {

    public SportStats {
        totals = totals == null ? Map.of() : Map.copyOf(totals);
    }

    /**
     * Builds the core part (sessions, duration, calories) from the core columns; the plugin
     * only names its own totals.
     */
    public static SportStats of(SportTypeDescriptor sport, List<ActivityEntity> activities,
            Map<String, Double> totals) {
        long duration = 0;
        int calories = 0;
        for (ActivityEntity a : activities) {
            duration += a.durationS == null ? 0 : a.durationS;
            calories += a.calories == null ? 0 : a.calories;
        }
        return new SportStats(sport.code(), sport.label(), activities.size(), duration, calories, totals);
    }
}
