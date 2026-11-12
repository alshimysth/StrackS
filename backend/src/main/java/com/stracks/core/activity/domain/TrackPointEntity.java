package com.stracks.core.activity.domain;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * One raw GPS fix of a geolocated activity. Raw data is the source of truth: every metric
 * is recomputed from it, never the other way around. Read through
 * {@code TrackPointRepository}, like the activity itself.
 */
@Entity
@Table(name = "track_points")
@IdClass(TrackPointEntity.Key.class)
public class TrackPointEntity {

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

    public static TrackPointEntity of(UUID activityId, int seq, Instant recordedAt, double lat, double lng,
            Double altitudeM, Double accuracyM) {
        TrackPointEntity p = new TrackPointEntity();
        p.activityId = activityId;
        p.seq = seq;
        p.recordedAt = recordedAt;
        p.lat = lat;
        p.lng = lng;
        p.altitudeM = altitudeM;
        p.accuracyM = accuracyM;
        return p;
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
