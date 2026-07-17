package com.stracks.core.activity;

import java.io.Serializable;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

@Entity
@Table(name = "track_points")
@IdClass(TrackPointEntity.Key.class)
public class TrackPointEntity extends PanacheEntityBase {

    @Id
    @Column(name = "activity_id")
    public UUID activityId;

    @Id
    public int seq;

    @Column(name = "recorded_at", nullable = false)
    public Instant recordedAt;

    @Column(nullable = false)
    public double lat;

    @Column(nullable = false)
    public double lng;

    @Column(name = "altitude_m")
    public Double altitudeM;

    @Column(name = "accuracy_m")
    public Double accuracyM;

    public static List<TrackPointEntity> findByActivity(UUID activityId) {
        return list("activityId = ?1 ORDER BY seq", activityId);
    }

    public static class Key implements Serializable {
        public UUID activityId;
        public int seq;

        public Key() {
        }

        public Key(UUID activityId, int seq) {
            this.activityId = activityId;
            this.seq = seq;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && k.seq == seq && Objects.equals(k.activityId, activityId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(activityId, seq);
        }
    }
}
