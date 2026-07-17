package com.sporttracker.core.activity;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoField;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.sporttracker.core.activity.ActivityDtos.StatsSummaryResponse;
import com.sporttracker.core.common.ApiException;

import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.jwt.JsonWebToken;

/**
 * Agrégats par période. Le socle groupe par sport_type et délègue computeStats
 * à chaque plugin — aucun calcul spécifique à un sport ici.
 */
@Path("/api/v1/stats")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed("user")
public class StatsResource {

    @Inject
    JsonWebToken jwt;

    @Inject
    SportRegistry registry;

    @GET
    @Path("/summary")
    public StatsSummaryResponse summary(
            @QueryParam("period") String period,
            @QueryParam("from") Instant from,
            @QueryParam("sport") String sport) {

        Instant start = from != null ? from : defaultStart(period);
        Instant end = Instant.now();

        StringBuilder query = new StringBuilder(
                "userId = ?1 and status = 'completed' and startedAt >= ?2 and startedAt < ?3");
        List<Object> params = new java.util.ArrayList<>(
                List.of(UUID.fromString(jwt.getSubject()), start, end));
        if (sport != null && !sport.isBlank()) {
            registry.require(sport);
            params.add(sport);
            query.append(" and sportType = ?").append(params.size());
        }

        List<ActivityEntity> activities = ActivityEntity.list(query.toString(), params.toArray());
        Map<String, List<ActivityEntity>> bySport = activities.stream()
                .collect(Collectors.groupingBy(a -> a.sportType));

        List<SportStats> stats = bySport.entrySet().stream()
                .map(e -> registry.require(e.getKey()).computeStats(e.getValue()))
                .sorted(java.util.Comparator.comparing(SportStats::sportType))
                .toList();

        return new StatsSummaryResponse(
                start, end, stats,
                stats.stream().mapToInt(SportStats::sessions).sum(),
                stats.stream().mapToLong(SportStats::totalDurationS).sum(),
                stats.stream().mapToDouble(SportStats::totalDistanceM).sum(),
                stats.stream().mapToDouble(SportStats::totalElevationGainM).sum());
    }

    private Instant defaultStart(String period) {
        ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
        if (period == null || "week".equals(period)) {
            return now.with(ChronoField.DAY_OF_WEEK, 1).truncatedTo(java.time.temporal.ChronoUnit.DAYS).toInstant();
        }
        if ("month".equals(period)) {
            return now.withDayOfMonth(1).truncatedTo(java.time.temporal.ChronoUnit.DAYS).toInstant();
        }
        throw new ApiException(400, "Période invalide", "period doit valoir 'week' ou 'month'.");
    }
}
