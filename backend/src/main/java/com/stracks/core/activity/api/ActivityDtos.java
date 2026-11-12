package com.stracks.core.activity.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.TrackPointEntity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Activity lifecycle DTOs, sport-agnostic. Transport shapes only: the use cases take commands. */
public final class ActivityDtos {

    private ActivityDtos() {
    }

    public record CreateActivityRequest(
            @NotBlank String sportType,
            @NotNull Instant startedAt) {
    }

    public record StopActivityRequest(
            @NotNull Instant endedAt,
            /** Active duration measured by the client (pauses excluded). Takes precedence when
             *  provided (offline session created after the fact). */
            Integer durationS,
            /** Client report, re-validated then completed by the plugin. */
            JsonNode metrics,
            String notes) {
    }

    /**
     * Partial edit (#25). An absent field (`null`) is left untouched; to clear a title
     * the client sends an empty string, which the service turns into `null`.
     * Without this convention, "don't change" and "clear" would be indistinguishable.
     */
    public record UpdateActivityRequest(
            @Size(max = 120, message = "Le titre ne peut pas dépasser 120 caractères.") String title,
            String notes,
            JsonNode metrics) {
    }

    public record ActivityResponse(
            UUID id,
            String sportType,
            String status,
            Instant startedAt,
            Instant endedAt,
            Integer durationS,
            BigDecimal distanceM,
            Integer calories,
            String title,
            String notes,
            JsonNode metrics) {

        public static ActivityResponse of(ActivityEntity a) {
            return new ActivityResponse(a.id, a.sportType, a.status, a.startedAt, a.endedAt,
                    a.durationS, a.distanceM, a.calories, a.title, a.notes, a.metrics);
        }
    }

    public record PageResponse<T>(List<T> items, int page, int size, long total) {
    }

    public record TrackPointDto(
            int seq,
            @NotNull Instant recordedAt,
            double lat,
            double lng,
            Double altitudeM,
            Double accuracyM) {

        public static TrackPointDto of(TrackPointEntity p) {
            return new TrackPointDto(p.seq, p.recordedAt, p.lat, p.lng, p.altitudeM, p.accuracyM);
        }

        /** The activity id is set by the use case, which checks ownership first. */
        public TrackPointEntity toEntity() {
            return TrackPointEntity.of(null, seq, recordedAt, lat, lng, altitudeM, accuracyM);
        }
    }

    public record TrackPointBatchRequest(@NotEmpty List<@Valid TrackPointDto> points) {
    }

    public record TrackPointBatchResponse(int received, int inserted) {
    }
}
