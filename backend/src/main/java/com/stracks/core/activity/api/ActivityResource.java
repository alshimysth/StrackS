package com.stracks.core.activity.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.stracks.core.activity.api.ActivityDtos.ActivityResponse;
import com.stracks.core.activity.api.ActivityDtos.CreateActivityRequest;
import com.stracks.core.activity.api.ActivityDtos.PageResponse;
import com.stracks.core.activity.api.ActivityDtos.StopActivityRequest;
import com.stracks.core.activity.api.ActivityDtos.TrackPointBatchRequest;
import com.stracks.core.activity.api.ActivityDtos.TrackPointBatchResponse;
import com.stracks.core.activity.api.ActivityDtos.TrackPointDto;
import com.stracks.core.activity.api.ActivityDtos.UpdateActivityRequest;
import com.stracks.core.activity.application.ActivityCommands;
import com.stracks.core.activity.application.ActivityRepository.ActivityPage;
import com.stracks.core.activity.application.ActivityService;
import com.stracks.core.activity.domain.TrackPointEntity;

import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.jwt.JsonWebToken;

/**
 * HTTP adapter of the activity lifecycle: maps requests to {@link ActivityService}
 * commands and entities to responses. No business rule lives here.
 */
@Path("/api/v1/activities")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed("user")
public class ActivityResource {

    @Inject
    JsonWebToken jwt;

    @Inject
    ActivityService service;

    private UUID userId() {
        return UUID.fromString(jwt.getSubject());
    }

    // --- Lifecycle ---

    @POST
    public Response start(@Valid CreateActivityRequest request) {
        var activity = service.start(userId(), new ActivityCommands.Start(request.sportType(), request.startedAt()));
        return Response.status(201).entity(ActivityResponse.of(activity)).build();
    }

    @POST
    @Path("/{id}/pause")
    @Consumes(MediaType.WILDCARD) // body-less POST
    public ActivityResponse pause(@PathParam("id") UUID id) {
        return ActivityResponse.of(service.pause(userId(), id));
    }

    @POST
    @Path("/{id}/resume")
    @Consumes(MediaType.WILDCARD) // body-less POST
    public ActivityResponse resume(@PathParam("id") UUID id) {
        return ActivityResponse.of(service.resume(userId(), id));
    }

    @POST
    @Path("/{id}/stop")
    public ActivityResponse stop(@PathParam("id") UUID id, @Valid StopActivityRequest request) {
        return ActivityResponse.of(service.stop(userId(), id, new ActivityCommands.Stop(
                request.endedAt(), request.durationS(), request.metrics(), request.notes())));
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") UUID id) {
        service.delete(userId(), id);
        return Response.noContent().build();
    }

    // --- History ---

    @GET
    public PageResponse<ActivityResponse> list(
            @QueryParam("sport") String sport,
            @QueryParam("from") Instant from,
            @QueryParam("to") Instant to,
            @QueryParam("page") Integer page,
            @QueryParam("size") Integer size) {
        ActivityCommands.ListQuery query = ActivityCommands.ListQuery.of(sport, from, to, page, size);
        ActivityPage result = service.list(userId(), query);
        return new PageResponse<>(result.items().stream().map(ActivityResponse::of).toList(),
                query.page(), query.size(), result.total());
    }

    @GET
    @Path("/{id}")
    public ActivityResponse get(@PathParam("id") UUID id) {
        return ActivityResponse.of(service.get(userId(), id));
    }

    @PATCH
    @Path("/{id}")
    public ActivityResponse update(@PathParam("id") UUID id, @Valid UpdateActivityRequest request) {
        return ActivityResponse.of(service.update(userId(), id,
                new ActivityCommands.Update(request.title(), request.notes(), request.metrics())));
    }

    // --- GPS track ---

    @POST
    @Path("/{id}/track-points")
    public Response uploadTrackPoints(@PathParam("id") UUID id, @Valid TrackPointBatchRequest batch) {
        List<TrackPointEntity> points = batch.points().stream().map(TrackPointDto::toEntity).toList();
        int inserted = service.uploadTrackPoints(userId(), id, points);
        return Response.status(201).entity(new TrackPointBatchResponse(batch.points().size(), inserted)).build();
    }

    @GET
    @Path("/{id}/track-points")
    public List<TrackPointDto> trackPoints(@PathParam("id") UUID id) {
        return service.trackPoints(userId(), id).stream().map(TrackPointDto::of).toList();
    }
}
