package com.stracks.core.activity;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "activities")
public class ActivityEntity extends PanacheEntityBase {

    public static final String STATUS_IN_PROGRESS = "in_progress";
    public static final String STATUS_PAUSED = "paused";
    public static final String STATUS_COMPLETED = "completed";

    @Id
    public UUID id;

    @Column(name = "user_id", nullable = false)
    public UUID userId;

    @Column(name = "sport_type", nullable = false)
    public String sportType;

    @Column(nullable = false)
    public String status = STATUS_IN_PROGRESS;

    @Column(name = "started_at", nullable = false)
    public Instant startedAt;

    @Column(name = "ended_at")
    public Instant endedAt;

    @Column(name = "duration_s")
    public Integer durationS;

    @Column(name = "distance_m", precision = 10, scale = 1)
    public BigDecimal distanceM;

    public Integer calories;

    public String notes;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    public JsonNode metrics;

    @Column(name = "paused_at")
    public Instant pausedAt;

    @Column(name = "paused_total_s", nullable = false)
    public int pausedTotalS = 0;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }
}
