package com.sporttracker.core.activity;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.sporttracker.core.activity.ActivityDtos.ActivityResponse;
import com.sporttracker.core.activity.ActivityDtos.CreateActivityRequest;
import com.sporttracker.core.activity.ActivityDtos.PageResponse;
import com.sporttracker.core.activity.ActivityDtos.StopActivityRequest;
import com.sporttracker.core.activity.ActivityDtos.TrackPointBatchRequest;
import com.sporttracker.core.activity.ActivityDtos.TrackPointDto;
import com.sporttracker.core.activity.ActivityDtos.UpdateActivityRequest;
import com.sporttracker.core.common.ApiException;

import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
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
 * Cycle de vie générique des activités. Ne connaît aucun sport : validation et
 * calculs de métriques sont délégués au plugin du sport_type concerné.
 * Toutes les routes sont scopées à l'utilisateur du token (anti-IDOR : une
 * activité d'un autre utilisateur répond 404, jamais 403).
 */
@Path("/api/v1/activities")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed("user")
public class ActivityResource {

    @Inject
    JsonWebToken jwt;

    @Inject
    SportRegistry registry;

    @Inject
    EntityManager em;

    private UUID userId() {
        return UUID.fromString(jwt.getSubject());
    }

    private ActivityEntity owned(UUID activityId) {
        ActivityEntity activity = ActivityEntity.findById(activityId);
        if (activity == null || !activity.userId.equals(userId())) {
            throw ApiException.notFound("Activité");
        }
        return activity;
    }

    // --- Cycle de vie ---

    @POST
    @Transactional
    public Response start(@Valid CreateActivityRequest request) {
        SportPlugin plugin = registry.require(request.sportType()); // 422 si inconnu
        ActivityEntity activity = new ActivityEntity();
        activity.userId = userId();
        activity.sportType = plugin.descriptor().code();
        activity.startedAt = request.startedAt();
        activity.metrics = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        activity.persist();
        return Response.status(201).entity(ActivityResponse.of(activity)).build();
    }

    @POST
    @Path("/{id}/pause")
    @Consumes(MediaType.WILDCARD) // POST sans corps
    @Transactional
    public ActivityResponse pause(@PathParam("id") UUID id) {
        ActivityEntity activity = owned(id);
        if (!ActivityEntity.STATUS_IN_PROGRESS.equals(activity.status)) {
            throw ApiException.invalidTransition(activity.status, "pause");
        }
        activity.status = ActivityEntity.STATUS_PAUSED;
        activity.pausedAt = Instant.now();
        return ActivityResponse.of(activity);
    }

    @POST
    @Path("/{id}/resume")
    @Consumes(MediaType.WILDCARD) // POST sans corps
    @Transactional
    public ActivityResponse resume(@PathParam("id") UUID id) {
        ActivityEntity activity = owned(id);
        if (!ActivityEntity.STATUS_PAUSED.equals(activity.status)) {
            throw ApiException.invalidTransition(activity.status, "resume");
        }
        activity.pausedTotalS += (int) Duration.between(activity.pausedAt, Instant.now()).toSeconds();
        activity.pausedAt = null;
        activity.status = ActivityEntity.STATUS_IN_PROGRESS;
        return ActivityResponse.of(activity);
    }

    @POST
    @Path("/{id}/stop")
    @Transactional
    public ActivityResponse stop(@PathParam("id") UUID id, @Valid StopActivityRequest request) {
        ActivityEntity activity = owned(id);
        if (ActivityEntity.STATUS_COMPLETED.equals(activity.status)) {
            throw ApiException.invalidTransition(activity.status, "stop");
        }
        SportPlugin plugin = registry.require(activity.sportType);
        if (request.metrics() != null) {
            plugin.validateMetrics(request.metrics());
            activity.metrics = request.metrics();
        }

        // Pause encore ouverte au moment du stop : la clore
        if (ActivityEntity.STATUS_PAUSED.equals(activity.status) && activity.pausedAt != null) {
            activity.pausedTotalS += (int) Duration.between(activity.pausedAt, request.endedAt()).toSeconds();
            activity.pausedAt = null;
        }

        activity.endedAt = request.endedAt();
        activity.durationS = request.durationS() != null
                ? request.durationS()
                : Math.max(0, (int) Duration.between(activity.startedAt, activity.endedAt).toSeconds()
                        - activity.pausedTotalS);
        activity.notes = request.notes() != null ? request.notes() : activity.notes;

        // Le serveur recalcule les métriques finales depuis le tracé brut (source de vérité)
        List<TrackPointEntity> track = TrackPointEntity.findByActivity(activity.id);
        activity.metrics = plugin.computeFinalMetrics(activity, track);
        if (plugin.descriptor().usesGps() && !track.isEmpty()) {
            double distance = GpsComputations.compute(track, plugin.maxGpsSpeedKmh()).distanceM();
            activity.distanceM = BigDecimal.valueOf(distance).setScale(1, RoundingMode.HALF_UP);
        }
        activity.status = ActivityEntity.STATUS_COMPLETED;
        return ActivityResponse.of(activity);
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    public Response delete(@PathParam("id") UUID id) {
        owned(id).delete(); // cascade SQL sur track_points
        return Response.noContent().build();
    }

    // --- Historique ---

    @GET
    public PageResponse<ActivityResponse> list(
            @QueryParam("sport") String sport,
            @QueryParam("from") Instant from,
            @QueryParam("to") Instant to,
            @QueryParam("page") Integer page,
            @QueryParam("size") Integer size) {

        int p = page == null ? 0 : Math.max(0, page);
        int s = size == null ? 20 : Math.min(100, Math.max(1, size));

        StringBuilder query = new StringBuilder("userId = ?1");
        List<Object> params = new ArrayList<>(List.of(userId()));
        if (sport != null && !sport.isBlank()) {
            params.add(sport);
            query.append(" and sportType = ?").append(params.size());
        }
        if (from != null) {
            params.add(from);
            query.append(" and startedAt >= ?").append(params.size());
        }
        if (to != null) {
            params.add(to);
            query.append(" and startedAt < ?").append(params.size());
        }

        var q = ActivityEntity.find(query.toString(), Sort.descending("startedAt"), params.toArray());
        long total = q.count();
        List<ActivityResponse> items = q.page(Page.of(p, s)).<ActivityEntity>list()
                .stream().map(ActivityResponse::of).toList();
        return new PageResponse<>(items, p, s, total);
    }

    @GET
    @Path("/{id}")
    public ActivityResponse get(@PathParam("id") UUID id) {
        return ActivityResponse.of(owned(id));
    }

    @PATCH
    @Path("/{id}")
    @Transactional
    public ActivityResponse update(@PathParam("id") UUID id, UpdateActivityRequest request) {
        ActivityEntity activity = owned(id);
        if (request.notes() != null) {
            activity.notes = request.notes();
        }
        if (request.metrics() != null) {
            registry.require(activity.sportType).validateMetrics(request.metrics());
            activity.metrics = request.metrics();
        }
        return ActivityResponse.of(activity);
    }

    // --- Tracé GPS ---

    @POST
    @Path("/{id}/track-points")
    @Transactional
    public Response uploadTrackPoints(@PathParam("id") UUID id, @Valid TrackPointBatchRequest batch) {
        ActivityEntity activity = owned(id);
        // Idempotent par (activity_id, seq) : un lot rejoué (retry réseau) n'est pas dupliqué
        int inserted = 0;
        for (TrackPointDto p : batch.points()) {
            inserted += em.createNativeQuery("""
                    INSERT INTO track_points (activity_id, seq, recorded_at, lat, lng, altitude_m, accuracy_m)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                    ON CONFLICT (activity_id, seq) DO NOTHING""")
                    .setParameter(1, activity.id)
                    .setParameter(2, p.seq())
                    .setParameter(3, p.recordedAt())
                    .setParameter(4, p.lat())
                    .setParameter(5, p.lng())
                    .setParameter(6, p.altitudeM())
                    .setParameter(7, p.accuracyM())
                    .executeUpdate();
        }
        return Response.status(201).entity(java.util.Map.of("received", batch.points().size(),
                "inserted", inserted)).build();
    }

    @GET
    @Path("/{id}/track-points")
    public List<TrackPointDto> trackPoints(@PathParam("id") UUID id) {
        return TrackPointEntity.findByActivity(owned(id).id).stream()
                .map(p -> new TrackPointDto(p.seq, p.recordedAt, p.lat, p.lng, p.altitudeM, p.accuracyM))
                .toList();
    }
}
