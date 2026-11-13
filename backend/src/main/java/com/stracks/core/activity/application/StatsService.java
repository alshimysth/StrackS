package com.stracks.core.activity.application;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoField;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.stracks.core.activity.application.ActivityRepository.TimelineRow;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.PersonalRecordMetric;
import com.stracks.core.activity.domain.SportPlugin;
import com.stracks.core.activity.domain.SportStats;
import com.stracks.core.common.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Aggregates per period (#24) and personal records (#61).
 *
 * <p>Two deliberate strategies:
 * <ul>
 *   <li>{@link #summary} loads the activities and <strong>delegates to each plugin</strong>.
 *       A sport's metrics live in the {@code metrics} JSONB, whose keys only the plugin
 *       knows; aggregating them in SQL would force the core to write
 *       {@code metrics->>'elevationGainM'}, that is, to know a sport.</li>
 *   <li>{@link #timeline} aggregates <strong>in SQL</strong>. The chart only plots core
 *       columns ({@code duration_s}, {@code distance_m}): no plugin has a say, and we
 *       avoid pulling a year of sessions into memory to get twelve numbers out of it
 *       (#28).</li>
 * </ul>
 *
 * <p>Every window is <strong>closed</strong> and aligned on the user's local calendar:
 * comparing a month in progress to a full month would give a systematically negative
 * trend, and cutting weeks in UTC would push a Monday 00:30 run in Paris into the
 * previous week.
 */
@ApplicationScoped
public class StatsService {

    /** Chart zoom: each period has its own granularity, never more than ~31 bars. */
    private static final Map<String, ChronoUnit> BUCKET_OF_PERIOD = Map.of(
            "week", ChronoUnit.DAYS,
            "month", ChronoUnit.WEEKS,
            "year", ChronoUnit.MONTHS);

    /** "All time" window of {@link #summary} (#7). */
    public static final String PERIOD_ALL = "all";

    @Inject
    SportRegistry registry;

    @Inject
    ActivityRepository activities;

    // ------------------------------------------------------------------
    // Results
    // ------------------------------------------------------------------

    /**
     * Totals of a window, all sports combined. {@code totals} aggregates key by key what
     * the plugins named: a missing key means "no sport in the period measures this
     * quantity", which is not the same thing as zero.
     */
    public record Totals(int sessions, long durationS, int calories, Map<String, Double> totals) {
    }

    /** {@code previous} is the same window shifted back by one period (June when viewing July). */
    public record Summary(Instant from, Instant to, List<SportStats> bySport, Totals current, Totals previous) {
    }

    public record TimelineValue(String sportType, int sessions, long durationS, double distanceM) {
    }

    public record TimelineBucket(Instant start, Instant end, List<TimelineValue> bySport) {
    }

    public record Timeline(Instant from, Instant to, String bucket, List<TimelineBucket> buckets) {
    }

    /** Holder of a record: the session with the highest value, the oldest one on a tie. */
    public record Record(String key, String label, String unit, double value, UUID activityId, Instant startedAt) {
    }

    public record SportRecords(String sportType, String label, int sessions, List<Record> records) {
    }

    // ------------------------------------------------------------------
    // Use cases
    // ------------------------------------------------------------------

    public Summary summary(UUID userId, String period, Instant from, String sport, String tz) {
        String resolvedPeriod = requireSummaryPeriod(period);
        ZoneId zone = requireZone(tz);
        String resolvedSport = requireSportOrNull(sport);

        Window current = windowOf(resolvedPeriod, from, zone);
        Window previous = current.previous(resolvedPeriod, zone);

        List<SportStats> bySport = aggregateBySport(userId, current, resolvedSport);
        return new Summary(current.start(), current.end(), bySport,
                sum(bySport), sum(aggregateBySport(userId, previous, resolvedSport)));
    }

    public Timeline timeline(UUID userId, String period, Instant from, String sport, String tz) {
        String resolvedPeriod = requirePeriod(period);
        ZoneId zone = requireZone(tz);
        String resolvedSport = requireSportOrNull(sport);

        Window window = windowOf(resolvedPeriod, from, zone);
        ChronoUnit unit = BUCKET_OF_PERIOD.get(resolvedPeriod);

        // Bounds are computed in Java, not inferred from the returned rows: a week
        // without sessions must exist in the response, at zero. SQL can't invent a row
        // for an empty group.
        List<Instant> starts = bucketStarts(window, unit, zone);
        Map<Instant, List<TimelineValue>> rows = new LinkedHashMap<>();
        for (TimelineRow row : activities.aggregateByBucket(
                userId, window.start(), window.end(), resolvedSport, sqlUnit(unit), zone.getId())) {
            rows.computeIfAbsent(row.bucketStart(), k -> new ArrayList<>())
                    .add(new TimelineValue(row.sportType(), row.sessions(), row.durationS(), row.distanceM()));
        }

        List<TimelineBucket> buckets = new ArrayList<>(starts.size());
        for (int i = 0; i < starts.size(); i++) {
            Instant start = starts.get(i);
            // The last interval is clipped to the window: a week straddling August
            // doesn't claim days that weren't counted.
            Instant end = i + 1 < starts.size()
                    ? starts.get(i + 1).isBefore(window.end()) ? starts.get(i + 1) : window.end()
                    : window.end();
            buckets.add(new TimelineBucket(start, end, rows.getOrDefault(start, List.of())));
        }
        return new Timeline(window.start(), window.end(), sqlUnit(unit), buckets);
    }

    /**
     * Personal records (#61), over the user's whole completed history. Computed in memory,
     * sport by sport, so that each plugin reads its own values: same choice as the summary.
     */
    public List<SportRecords> records(UUID userId, String sport) {
        String resolvedSport = requireSportOrNull(sport);
        List<ActivityEntity> history = activities.findCompletedChronological(userId, resolvedSport);

        Map<String, List<ActivityEntity>> bySport = history.stream()
                .collect(Collectors.groupingBy(a -> a.sportType, LinkedHashMap::new, Collectors.toList()));

        return bySport.entrySet().stream()
                .map(e -> recordsOf(registry.require(e.getKey()), e.getValue()))
                .sorted(Comparator.comparing(SportRecords::sportType))
                .toList();
    }

    private static SportRecords recordsOf(SportPlugin plugin, List<ActivityEntity> chronological) {
        List<PersonalRecordMetric> metrics = new ArrayList<>();
        metrics.add(PersonalRecordMetric.LONGEST_DURATION);
        metrics.addAll(plugin.personalRecordMetrics());

        List<Record> records = new ArrayList<>();
        for (PersonalRecordMetric metric : metrics) {
            ActivityEntity holder = null;
            double best = 0; // a zero or negative value is a record of nothing
            for (ActivityEntity activity : chronological) {
                Double value = metric.value().apply(activity);
                if (value != null && value > best) { // strictly: equalling doesn't dethrone
                    best = value;
                    holder = activity;
                }
            }
            if (holder != null) {
                records.add(new Record(metric.key(), metric.label(), metric.unit(), best, holder.id, holder.startedAt));
            }
        }
        return new SportRecords(plugin.descriptor().code(), plugin.descriptor().label(),
                chronological.size(), records);
    }

    // ------------------------------------------------------------------
    // Aggregation
    // ------------------------------------------------------------------

    /** Delegates to each plugin the computation of its own metrics. */
    private List<SportStats> aggregateBySport(UUID userId, Window window, String sport) {
        Map<String, List<ActivityEntity>> bySport = activities
                .findCompleted(userId, window.start(), window.end(), sport).stream()
                .collect(Collectors.groupingBy(a -> a.sportType));

        return bySport.entrySet().stream()
                .map(e -> registry.require(e.getKey()).computeStats(e.getValue()))
                .sorted(Comparator.comparing(SportStats::sportType))
                .toList();
    }

    /** Sums key by key what the plugins named, without knowing what those keys mean. */
    private static Totals sum(List<SportStats> bySport) {
        Map<String, Double> totals = new LinkedHashMap<>();
        for (SportStats stats : bySport) {
            stats.totals().forEach((key, value) -> totals.merge(key, value, Double::sum));
        }
        return new Totals(
                bySport.stream().mapToInt(SportStats::sessions).sum(),
                bySport.stream().mapToLong(SportStats::totalDurationS).sum(),
                bySport.stream().mapToInt(SportStats::calories).sum(),
                totals);
    }

    // ------------------------------------------------------------------
    // Period windows
    // ------------------------------------------------------------------

    /** Closed window [start, end[, aligned on the calendar of {@code zone}. */
    private record Window(Instant start, Instant end) {

        Window previous(String period, ZoneId zone) {
            if (PERIOD_ALL.equals(period)) {
                // "All time" has no previous period: empty window, hence zero totals;
                // the client shows no comparison.
                return new Window(start(), start());
            }
            ZonedDateTime start = start().atZone(zone);
            return switch (period) {
                case "week" -> new Window(start.minusWeeks(1).toInstant(), start.toInstant());
                case "month" -> new Window(start.minusMonths(1).toInstant(), start.toInstant());
                default -> new Window(start.minusYears(1).toInstant(), start.toInstant());
            };
        }
    }

    /**
     * {@code from} designates an instant <em>within</em> the wanted period, not its lower
     * bound: that's what lets the screen navigate month by month by sending any date in
     * July to get the whole of July.
     */
    private static Window windowOf(String period, Instant from, ZoneId zone) {
        if (PERIOD_ALL.equals(period)) {
            // All time (#7): the account's whole history, up to now.
            // `from` is meaningless here and ignored; so is the time zone.
            return new Window(Instant.EPOCH, Instant.now());
        }
        ZonedDateTime anchor = (from != null ? from : Instant.now()).atZone(zone);
        ZonedDateTime start = switch (period) {
            case "week" -> anchor.with(ChronoField.DAY_OF_WEEK, 1).truncatedTo(ChronoUnit.DAYS);
            case "month" -> anchor.withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS);
            default -> anchor.withDayOfYear(1).truncatedTo(ChronoUnit.DAYS);
        };
        ZonedDateTime end = switch (period) {
            case "week" -> start.plusWeeks(1);
            case "month" -> start.plusMonths(1);
            default -> start.plusYears(1);
        };
        return new Window(start.toInstant(), end.toInstant());
    }

    /**
     * Bounds of each interval, computed on the local calendar.
     *
     * <p>The first interval is <strong>moved back to its natural boundary</strong>: the
     * Monday of the week containing the 1st of the month. This is mandatory: on the
     * database side, {@code date_trunc('week', …)} snaps to the ISO Monday, and bounds
     * computed as "the 1st, then every 7 days" would never land on the same keys. The
     * aggregated rows would match no interval and the chart would be empty although the
     * sessions exist.
     *
     * <p>The query window itself stays strictly the month: the straddling week only
     * counts its July days, never the June ones; otherwise the chart total would stop
     * matching the summary one. It's also what the mockup shows, whose first July bar is
     * labelled "29/6".
     */
    private static List<Instant> bucketStarts(Window window, ChronoUnit unit, ZoneId zone) {
        List<Instant> starts = new ArrayList<>();
        ZonedDateTime cursor = truncateTo(window.start().atZone(zone), unit);
        ZonedDateTime end = window.end().atZone(zone);
        while (cursor.isBefore(end)) {
            starts.add(cursor.toInstant());
            // plus(1, unit) rather than adding 7 days in seconds: daylight saving time
            // makes 23- and 25-hour days, and fixed-duration arithmetic would shift every
            // following interval.
            cursor = cursor.plus(1, unit);
        }
        return starts;
    }

    /** Same boundary as {@code date_trunc} on the PostgreSQL side: ISO Monday for weeks. */
    private static ZonedDateTime truncateTo(ZonedDateTime moment, ChronoUnit unit) {
        return switch (unit) {
            case DAYS -> moment.truncatedTo(ChronoUnit.DAYS);
            case WEEKS -> moment.with(ChronoField.DAY_OF_WEEK, 1).truncatedTo(ChronoUnit.DAYS);
            default -> moment.withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS);
        };
    }

    // ------------------------------------------------------------------
    // Parameter validation
    // ------------------------------------------------------------------

    /**
     * The summary additionally accepts {@code all} (#7, profile statistics). Not the
     * timeline: an "all time" chart has no natural granularity, and no screen needs one.
     */
    private static String requireSummaryPeriod(String period) {
        if (PERIOD_ALL.equals(period)) {
            return PERIOD_ALL;
        }
        try {
            return requirePeriod(period);
        } catch (ApiException e) {
            throw new ApiException(400, "Période invalide",
                    "period doit valoir 'week', 'month', 'year' ou 'all'.");
        }
    }

    private static String requirePeriod(String period) {
        if (period == null || period.isBlank()) {
            return "week";
        }
        if (!BUCKET_OF_PERIOD.containsKey(period)) {
            throw new ApiException(400, "Période invalide",
                    "period doit valoir 'week', 'month' ou 'year'.");
        }
        return period;
    }

    private static ZoneId requireZone(String tz) {
        if (tz == null || tz.isBlank()) {
            return ZoneId.of("UTC");
        }
        try {
            return ZoneId.of(tz);
        } catch (DateTimeException e) {
            throw new ApiException(400, "Fuseau horaire invalide",
                    "tz doit être un identifiant IANA, par exemple 'Europe/Paris'.");
        }
    }

    private String requireSportOrNull(String sport) {
        if (sport == null || sport.isBlank()) {
            return null;
        }
        registry.require(sport);
        return sport;
    }

    private static String sqlUnit(ChronoUnit unit) {
        return switch (unit) {
            case DAYS -> "day";
            case WEEKS -> "week";
            default -> "month";
        };
    }
}
