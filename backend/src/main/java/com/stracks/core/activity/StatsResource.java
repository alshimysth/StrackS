package com.stracks.core.activity;

import java.math.BigDecimal;
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

import com.stracks.core.activity.StatsDtos.StatsSummaryResponse;
import com.stracks.core.activity.StatsDtos.StatsTimelineResponse;
import com.stracks.core.activity.StatsDtos.StatsTotals;
import com.stracks.core.activity.StatsDtos.TimelineBucket;
import com.stracks.core.activity.StatsDtos.TimelineSportValue;
import com.stracks.core.common.ApiException;

import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.jwt.JsonWebToken;

/**
 * Agrégats par période (#24).
 *
 * <p>Deux routes, deux stratégies assumées :
 * <ul>
 *   <li>{@code /summary} charge les activités et <strong>délègue à chaque plugin</strong>.
 *       Les métriques d'un sport vivent dans le JSONB {@code metrics}, dont seul le
 *       plugin connaît les clés — les agréger en SQL obligerait le socle à écrire
 *       {@code metrics->>'elevationGainM'}, c'est-à-dire à connaître un sport.</li>
 *   <li>{@code /timeline} agrège <strong>en SQL</strong>. Le graphique ne trace que
 *       des colonnes du socle ({@code duration_s}, {@code distance_m}) : aucun plugin
 *       n'a son mot à dire, et on évite de rapatrier une année de séances en mémoire
 *       pour en tirer douze nombres (#28).</li>
 * </ul>
 *
 * <p>Toutes les fenêtres sont <strong>fermées</strong> et alignées sur le calendrier
 * local de l'utilisateur : comparer un mois en cours à un mois complet donnerait une
 * évolution systématiquement négative, et découper les semaines en UTC ferait basculer
 * une sortie du lundi 00h30 à Paris dans la semaine précédente.
 */
@Path("/api/v1/stats")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed("user")
public class StatsResource {

    /** Zoom du graphique : à chaque période sa maille, jamais plus de ~31 barres. */
    private static final Map<String, ChronoUnit> BUCKET_OF_PERIOD = Map.of(
            "week", ChronoUnit.DAYS,
            "month", ChronoUnit.WEEKS,
            "year", ChronoUnit.MONTHS);

    @Inject
    JsonWebToken jwt;

    @Inject
    SportRegistry registry;

    @Inject
    EntityManager em;

    @GET
    @Path("/summary")
    public StatsSummaryResponse summary(
            @QueryParam("period") String period,
            @QueryParam("from") Instant from,
            @QueryParam("sport") String sport,
            @QueryParam("tz") String tz) {

        UUID userId = currentUser();
        String resolvedPeriod = requirePeriod(period);
        ZoneId zone = requireZone(tz);
        String resolvedSport = requireSportOrNull(sport);

        Window current = windowOf(resolvedPeriod, from, zone);
        Window previous = current.previous(resolvedPeriod, zone);

        List<SportStats> bySport = aggregateBySport(userId, current, resolvedSport);
        StatsTotals currentTotals = sum(bySport);
        StatsTotals previousTotals = sum(aggregateBySport(userId, previous, resolvedSport));

        return new StatsSummaryResponse(
                current.start(), current.end(), bySport,
                currentTotals.sessions(), currentTotals.durationS(), currentTotals.totals(),
                previousTotals);
    }

    @GET
    @Path("/timeline")
    public StatsTimelineResponse timeline(
            @QueryParam("period") String period,
            @QueryParam("from") Instant from,
            @QueryParam("sport") String sport,
            @QueryParam("tz") String tz) {

        UUID userId = currentUser();
        String resolvedPeriod = requirePeriod(period);
        ZoneId zone = requireZone(tz);
        String resolvedSport = requireSportOrNull(sport);

        Window window = windowOf(resolvedPeriod, from, zone);
        ChronoUnit unit = BUCKET_OF_PERIOD.get(resolvedPeriod);

        // Les bornes sont calculées en Java, pas déduites des lignes rendues : une
        // semaine sans séance doit exister dans la réponse, à zéro. Le SQL ne peut
        // pas inventer une ligne pour un groupe vide.
        List<Instant> starts = bucketStarts(window, unit, zone);
        Map<Instant, List<TimelineSportValue>> rows = aggregateByBucket(
                userId, window, resolvedSport, unit, zone);

        List<TimelineBucket> buckets = new ArrayList<>(starts.size());
        for (int i = 0; i < starts.size(); i++) {
            Instant start = starts.get(i);
            // Le dernier intervalle est coupé à la fenêtre : une semaine à cheval sur
            // août ne prétend pas contenir des jours qui n'ont pas été comptés.
            Instant end = i + 1 < starts.size()
                    ? starts.get(i + 1).isBefore(window.end()) ? starts.get(i + 1) : window.end()
                    : window.end();
            buckets.add(new TimelineBucket(start, end, rows.getOrDefault(start, List.of())));
        }

        return new StatsTimelineResponse(
                window.start(), window.end(), sqlUnit(unit), buckets);
    }

    // ------------------------------------------------------------------
    // Agrégation
    // ------------------------------------------------------------------

    /** Délègue à chaque plugin le calcul de ses propres métriques. */
    private List<SportStats> aggregateBySport(UUID userId, Window window, String sport) {
        StringBuilder query = new StringBuilder(
                "userId = ?1 and status = 'completed' and startedAt >= ?2 and startedAt < ?3");
        List<Object> params = new ArrayList<>(List.of(userId, window.start(), window.end()));
        if (sport != null) {
            params.add(sport);
            query.append(" and sportType = ?").append(params.size());
        }

        List<ActivityEntity> activities = ActivityEntity.list(query.toString(), params.toArray());
        Map<String, List<ActivityEntity>> bySport = activities.stream()
                .collect(Collectors.groupingBy(a -> a.sportType));

        return bySport.entrySet().stream()
                .map(e -> registry.require(e.getKey()).computeStats(e.getValue()))
                .sorted(Comparator.comparing(SportStats::sportType))
                .toList();
    }

    /**
     * Découpage temporel, en SQL. {@code AT TIME ZONE} ramène l'instant à l'heure
     * locale avant la troncature, puis l'y renvoie : sans ça les semaines seraient
     * coupées à minuit UTC, soit 2h du matin en heure d'été française.
     */
    private Map<Instant, List<TimelineSportValue>> aggregateByBucket(
            UUID userId, Window window, String sport, ChronoUnit unit, ZoneId zone) {

        String sql = """
                select date_trunc(:unit, a.started_at at time zone :tz) at time zone :tz as bucket_start,
                       a.sport_type,
                       count(*) as sessions,
                       coalesce(sum(a.duration_s), 0) as duration_s,
                       coalesce(sum(a.distance_m), 0) as distance_m
                  from activities a
                 where a.user_id = :userId
                   and a.status = 'completed'
                   and a.started_at >= :from
                   and a.started_at < :to
                """
                + (sport != null ? "   and a.sport_type = :sport\n" : "")
                + " group by 1, 2 order by 1, 2";

        Query query = em.createNativeQuery(sql)
                .setParameter("unit", sqlUnit(unit))
                .setParameter("tz", zone.getId())
                .setParameter("userId", userId)
                .setParameter("from", window.start())
                .setParameter("to", window.end());
        if (sport != null) {
            query.setParameter("sport", sport);
        }

        Map<Instant, List<TimelineSportValue>> byBucket = new LinkedHashMap<>();
        for (Object row : query.getResultList()) {
            Object[] cells = (Object[]) row;
            Instant bucketStart = toInstant(cells[0]);
            byBucket.computeIfAbsent(bucketStart, k -> new ArrayList<>())
                    .add(new TimelineSportValue(
                            (String) cells[1],
                            ((Number) cells[2]).intValue(),
                            ((Number) cells[3]).longValue(),
                            toDouble(cells[4])));
        }
        return byBucket;
    }

    /** Somme clé à clé ce que les plugins ont nommé — sans savoir ce que ces clés désignent. */
    private StatsTotals sum(List<SportStats> bySport) {
        Map<String, Double> totals = new LinkedHashMap<>();
        for (SportStats stats : bySport) {
            stats.totals().forEach((key, value) -> totals.merge(key, value, Double::sum));
        }
        return new StatsTotals(
                bySport.stream().mapToInt(SportStats::sessions).sum(),
                bySport.stream().mapToLong(SportStats::totalDurationS).sum(),
                totals);
    }

    // ------------------------------------------------------------------
    // Fenêtres de période
    // ------------------------------------------------------------------

    /** Fenêtre fermée [start, end[, alignée sur le calendrier de {@code zone}. */
    private record Window(Instant start, Instant end) {

        Window previous(String period, ZoneId zone) {
            ZonedDateTime start = start().atZone(zone);
            return switch (period) {
                case "week" -> new Window(start.minusWeeks(1).toInstant(), start.toInstant());
                case "month" -> new Window(start.minusMonths(1).toInstant(), start.toInstant());
                default -> new Window(start.minusYears(1).toInstant(), start.toInstant());
            };
        }
    }

    /**
     * {@code from} désigne un instant <em>dans</em> la période voulue, pas sa borne
     * basse : c'est ce qui permet à l'écran de naviguer de mois en mois en envoyant
     * n'importe quelle date de juillet pour obtenir juillet entier.
     */
    private Window windowOf(String period, Instant from, ZoneId zone) {
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
     * Bornes de chaque intervalle, calculées sur le calendrier local.
     *
     * <p>Le premier intervalle est <strong>reculé jusqu'à sa frontière naturelle</strong>
     * — le lundi de la semaine qui contient le 1er du mois. C'est obligatoire : côté
     * base, {@code date_trunc('week', …)} cale sur le lundi ISO, et des bornes calculées
     * « le 1er, puis tous les 7 jours » ne tomberaient jamais sur les mêmes clés. Les
     * lignes agrégées ne se rattacheraient à aucun intervalle et le graphique serait
     * vide alors que les séances existent.
     *
     * <p>La fenêtre de la requête, elle, reste strictement le mois : la semaine à cheval
     * ne compte que ses jours de juillet, jamais ceux de juin — sans quoi le total du
     * graphique cesserait d'égaler celui de {@code /summary}. C'est aussi ce que montre
     * la maquette, dont la première barre de juillet est étiquetée « 29/6 ».
     */
    private List<Instant> bucketStarts(Window window, ChronoUnit unit, ZoneId zone) {
        List<Instant> starts = new ArrayList<>();
        ZonedDateTime cursor = truncateTo(window.start().atZone(zone), unit);
        ZonedDateTime end = window.end().atZone(zone);
        while (cursor.isBefore(end)) {
            starts.add(cursor.toInstant());
            // plus(1, unit) plutôt qu'un ajout de 7 jours en secondes : le passage à
            // l'heure d'été fait des journées de 23 et 25 heures, et une arithmétique
            // en durée fixe décalerait tous les intervalles suivants.
            cursor = cursor.plus(1, unit);
        }
        return starts;
    }

    /** Même frontière que {@code date_trunc} côté PostgreSQL — lundi ISO pour la semaine. */
    private static ZonedDateTime truncateTo(ZonedDateTime moment, ChronoUnit unit) {
        return switch (unit) {
            case DAYS -> moment.truncatedTo(ChronoUnit.DAYS);
            case WEEKS -> moment.with(ChronoField.DAY_OF_WEEK, 1).truncatedTo(ChronoUnit.DAYS);
            default -> moment.withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS);
        };
    }

    // ------------------------------------------------------------------
    // Validation des paramètres
    // ------------------------------------------------------------------

    private UUID currentUser() {
        return UUID.fromString(jwt.getSubject());
    }

    private String requirePeriod(String period) {
        if (period == null || period.isBlank()) {
            return "week";
        }
        if (!BUCKET_OF_PERIOD.containsKey(period)) {
            throw new ApiException(400, "Période invalide",
                    "period doit valoir 'week', 'month' ou 'year'.");
        }
        return period;
    }

    private ZoneId requireZone(String tz) {
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

    private static Instant toInstant(Object value) {
        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toInstant();
        }
        if (value instanceof java.time.OffsetDateTime offset) {
            return offset.toInstant();
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        throw new IllegalStateException(
                "Type de borne temporelle inattendu : " + value.getClass());
    }

    private static double toDouble(Object value) {
        return value instanceof BigDecimal decimal ? decimal.doubleValue()
                : ((Number) value).doubleValue();
    }
}
