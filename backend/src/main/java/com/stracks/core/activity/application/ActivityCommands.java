package com.stracks.core.activity.application;

import java.time.Instant;

import com.fasterxml.jackson.databind.JsonNode;

/** Inputs of the activity use cases, free of any transport concern. */
public final class ActivityCommands {

    private ActivityCommands() {
    }

    public record Start(String sportType, Instant startedAt) {
    }

    /**
     * @param durationS active duration measured by the client (pauses excluded). Takes
     *                  precedence when provided (offline session created after the fact).
     * @param metrics   client report, re-validated then completed by the plugin
     */
    public record Stop(Instant endedAt, Integer durationS, JsonNode metrics, String notes) {
    }

    /** Partial edit (#25): a {@code null} field is left untouched, an empty title clears it. */
    public record Update(String title, String notes, JsonNode metrics) {
    }

    public record ListQuery(String sport, Instant from, Instant to, int page, int size) {

        public static final int DEFAULT_SIZE = 20;
        public static final int MAX_SIZE = 100;

        public static ListQuery of(String sport, Instant from, Instant to, Integer page, Integer size) {
            int p = page == null ? 0 : Math.max(0, page);
            int s = size == null ? DEFAULT_SIZE : Math.min(MAX_SIZE, Math.max(1, size));
            String sportOrNull = sport == null || sport.isBlank() ? null : sport;
            return new ListQuery(sportOrNull, from, to, p, s);
        }
    }
}
