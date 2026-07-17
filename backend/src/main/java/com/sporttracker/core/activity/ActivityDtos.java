package com.sporttracker.core.activity;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

/** DTOs du cycle de vie d'activité — agnostiques au sport. */
public final class ActivityDtos {

    private ActivityDtos() {
    }

    public record CreateActivityRequest(
            @NotBlank String sportType,
            @NotNull Instant startedAt) {
    }

    public record StopActivityRequest(
            @NotNull Instant endedAt,
            /** Durée active mesurée par le client (pauses exclues) — prioritaire si fournie
             *  (cas séance hors ligne créée a posteriori). */
            Integer durationS,
            /** Métriques calculées côté client ; re-validées puis complétées par le plugin. */
            JsonNode metrics,
            String notes) {
    }

    public record UpdateActivityRequest(String notes, JsonNode metrics) {
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
            String notes,
            JsonNode metrics) {

        public static ActivityResponse of(ActivityEntity a) {
            return new ActivityResponse(a.id, a.sportType, a.status, a.startedAt, a.endedAt,
                    a.durationS, a.distanceM, a.calories, a.notes, a.metrics);
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
    }

    public record TrackPointBatchRequest(@NotEmpty List<@Valid TrackPointDto> points) {
    }

    public record StatsSummaryResponse(
            Instant from,
            Instant to,
            List<SportStats> bySport,
            int totalSessions,
            long totalDurationS,
            double totalDistanceM,
            double totalElevationGainM) {
    }
}
