package com.stracks.core.activity.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.stracks.core.activity.application.StatsService;
import com.stracks.core.activity.domain.SportStats;

/** Statistics aggregate DTOs. No sport is named here (see {@link SportStats}). */
public final class StatsDtos {

    private StatsDtos() {
    }

    /**
     * Totals of a window, all sports combined. {@code totals} aggregates key by key what
     * the plugins named: a missing key means "no sport in the period measures this
     * quantity", which is not the same thing as zero. {@code calories} is a core column,
     * summed over the sessions that have one.
     */
    public record StatsTotals(
            int sessions,
            long durationS,
            int calories,
            Map<String, Double> totals) {

        static StatsTotals of(StatsService.Totals t) {
            return new StatsTotals(t.sessions(), t.durationS(), t.calories(), t.totals());
        }
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
            int totalCalories,
            Map<String, Double> totals,
            StatsTotals previous) {

        static StatsSummaryResponse of(StatsService.Summary s) {
            return new StatsSummaryResponse(s.from(), s.to(), s.bySport(),
                    s.current().sessions(), s.current().durationS(), s.current().calories(), s.current().totals(),
                    StatsTotals.of(s.previous()));
        }
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

        static TimelineSportValue of(StatsService.TimelineValue v) {
            return new TimelineSportValue(v.sportType(), v.sessions(), v.durationS(), v.distanceM());
        }
    }

    /** One chart interval: a day, a week or a month depending on the zoom. */
    public record TimelineBucket(
            Instant start,
            Instant end,
            List<TimelineSportValue> bySport) {

        static TimelineBucket of(StatsService.TimelineBucket b) {
            return new TimelineBucket(b.start(), b.end(), b.bySport().stream().map(TimelineSportValue::of).toList());
        }
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

        static StatsTimelineResponse of(StatsService.Timeline t) {
            return new StatsTimelineResponse(t.from(), t.to(), t.bucket(),
                    t.buckets().stream().map(TimelineBucket::of).toList());
        }
    }

    /**
     * Personal records (#61). Computed over the <strong>whole</strong> history, server
     * side: a record read from a page of history would be wrong from the 21st session on.
     */
    public record PersonalRecordsResponse(List<SportRecords> bySport) {

        static PersonalRecordsResponse of(List<StatsService.SportRecords> bySport) {
            return new PersonalRecordsResponse(bySport.stream().map(SportRecords::of).toList());
        }
    }

    public record SportRecords(String sportType, String label, int sessions, List<PersonalRecord> records) {

        static SportRecords of(StatsService.SportRecords r) {
            return new SportRecords(r.sportType(), r.label(), r.sessions(),
                    r.records().stream().map(PersonalRecord::of).toList());
        }
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
            UUID activityId,
            Instant startedAt) {

        static PersonalRecord of(StatsService.Record r) {
            return new PersonalRecord(r.key(), r.label(), r.unit(), r.value(), r.activityId(), r.startedAt());
        }
    }
}
