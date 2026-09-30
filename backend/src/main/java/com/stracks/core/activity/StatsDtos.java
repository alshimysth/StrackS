package com.stracks.core.activity;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Statistics aggregate DTOs. No sport is named here (see {@link SportStats}). */
public final class StatsDtos {

    private StatsDtos() {
    }

    /**
     * Totals of a window, all sports combined. {@code totals} aggregates key by key what
     * the plugins named: a missing key means "no sport in the period measures this
     * quantity", which is not the same thing as zero.
     */
    public record StatsTotals(
            int sessions,
            long durationS,
            Map<String, Double> totals) {
    }

    /**
     * Response of {@code GET /stats/summary}.
     *
     * <p>{@code previous} holds the same window shifted back by one period (June when
     * viewing July): the comparison requires a window <em>closed</em> on both sides,
     * otherwise a month in progress is compared to a full month and the trend is
     * always negative.
     */
    public record StatsSummaryResponse(
            Instant from,
            Instant to,
            List<SportStats> bySport,
            int totalSessions,
            long totalDurationS,
            Map<String, Double> totals,
            StatsTotals previous) {
    }

    /**
     * Value of one sport within a chart interval.
     *
     * <p>All three quantities are <strong>core columns</strong> ({@code status},
     * {@code duration_s}, {@code distance_m}): the time bucketing is therefore computed in
     * SQL with no plugin involved, and without ever opening the {@code metrics} JSONB. A
     * sport without distance simply returns 0 and has no bar.
     */
    public record TimelineSportValue(
            String sportType,
            int sessions,
            long durationS,
            double distanceM) {
    }

    /** One chart interval: a day, a week or a month depending on the zoom. */
    public record TimelineBucket(
            Instant start,
            Instant end,
            List<TimelineSportValue> bySport) {
    }

    /**
     * Response of {@code GET /stats/timeline}.
     *
     * <p>Empty intervals are <strong>present</strong> and zeroed: it's up to the server to
     * say that the week of the 13th has nothing, not up to the client to infer it from a
     * hole in the list; otherwise the chart squeezes its bars and misrepresents the
     * spacing of time.
     */
    public record StatsTimelineResponse(
            Instant from,
            Instant to,
            String bucket,
            List<TimelineBucket> buckets) {
    }

    /**
     * Personal records (#61). Computed over the <strong>whole</strong> history, server
     * side: a record read from a page of history would be wrong from the 21st session on.
     */
    public record PersonalRecordsResponse(List<SportRecords> bySport) {
    }

    public record SportRecords(String sportType, String label, int sessions, List<PersonalRecord> records) {
    }

    /**
     * Holder of a record: the session with the highest value, the oldest one on a tie.
     * Equalling your record therefore doesn't beat it: today's session only becomes the
     * holder if it does strictly better.
     */
    public record PersonalRecord(
            String key,
            String label,
            String unit,
            double value,
            java.util.UUID activityId,
            Instant startedAt) {
    }
}
