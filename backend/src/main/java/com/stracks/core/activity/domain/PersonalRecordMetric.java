package com.stracks.core.activity.domain;

import java.util.function.Function;

/**
 * A quantity for which a sport keeps a personal record (#61).
 *
 * <p>The core doesn't know what deserves a record: the longest distance makes sense for
 * running, not for weight training, where it would be the load. Each plugin therefore
 * declares its own measures; the core imposes only one, which every activity has: duration.
 *
 * @param key   camelCase with the unit as suffix, same convention as {@link SportStats}
 * @param label label displayed as is by the client ("Plus longue distance")
 * @param unit  unit of the value ({@code m}, {@code s}, or a sport-specific one the client's
 *              module knows how to format); the client formats it
 * @param value extracts the value; {@code null} = no value for this session
 */
public record PersonalRecordMetric(
        String key,
        String label,
        String unit,
        Function<ActivityEntity, Double> value) {

    /** The only measure the core knows: every activity has a duration. */
    public static final PersonalRecordMetric LONGEST_DURATION = new PersonalRecordMetric(
            "durationS", "Plus longue séance", "s",
            a -> a.durationS == null ? null : a.durationS.doubleValue());

    /** The core column, when the sport writes one. Shared by every sport with a distance. */
    public static final PersonalRecordMetric LONGEST_DISTANCE = new PersonalRecordMetric(
            "distanceM", "Plus longue distance", "m",
            a -> a.distanceM == null ? null : a.distanceM.doubleValue());

    /** Reads a numeric key of the {@code metrics} JSONB, {@code null} when absent. */
    public static PersonalRecordMetric ofMetric(String key, String label, String unit) {
        return new PersonalRecordMetric(key, label, unit,
                a -> a.metrics != null && a.metrics.hasNonNull(key) && a.metrics.get(key).isNumber()
                        ? a.metrics.get(key).asDouble()
                        : null);
    }
}
