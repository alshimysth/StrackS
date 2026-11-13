package com.stracks.core.activity.api;

import java.time.Instant;
import java.util.UUID;

import com.stracks.core.activity.api.StatsDtos.PersonalRecordsResponse;
import com.stracks.core.activity.api.StatsDtos.StatsSummaryResponse;
import com.stracks.core.activity.api.StatsDtos.StatsTimelineResponse;
import com.stracks.core.activity.application.StatsService;

import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.jwt.JsonWebToken;

/** HTTP adapter of the statistics use cases (#24, #61). */
@Path("/api/v1/stats")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed("user")
public class StatsResource {

    @Inject
    JsonWebToken jwt;

    @Inject
    StatsService stats;

    private UUID userId() {
        return UUID.fromString(jwt.getSubject());
    }

    @GET
    @Path("/summary")
    public StatsSummaryResponse summary(
            @QueryParam("period") String period,
            @QueryParam("from") Instant from,
            @QueryParam("sport") String sport,
            @QueryParam("tz") String tz) {
        return StatsSummaryResponse.of(stats.summary(userId(), period, from, sport, tz));
    }

    @GET
    @Path("/timeline")
    public StatsTimelineResponse timeline(
            @QueryParam("period") String period,
            @QueryParam("from") Instant from,
            @QueryParam("sport") String sport,
            @QueryParam("tz") String tz) {
        return StatsTimelineResponse.of(stats.timeline(userId(), period, from, sport, tz));
    }

    @GET
    @Path("/records")
    public PersonalRecordsResponse records(@QueryParam("sport") String sport) {
        return PersonalRecordsResponse.of(stats.records(userId(), sport));
    }
}
