package com.stracks.core.activity.infrastructure.persistence;

import java.util.List;
import java.util.UUID;

import com.stracks.core.activity.application.TrackPointRepository;
import com.stracks.core.activity.domain.TrackPointEntity;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

/** Panache adapter of {@link TrackPointRepository}. */
@ApplicationScoped
public class PanacheTrackPointRepository
        implements TrackPointRepository, PanacheRepositoryBase<TrackPointEntity, TrackPointEntity.Key> {

    @Inject
    EntityManager em;

    @Override
    public List<TrackPointEntity> findByActivity(UUID activityId) {
        return list("activityId = ?1 order by seq", activityId);
    }

    /** Idempotent on (activity_id, seq): a replayed batch (network retry) isn't duplicated. */
    @Override
    public int insertIgnoringDuplicates(List<TrackPointEntity> points) {
        int inserted = 0;
        for (TrackPointEntity p : points) {
            inserted += em.createNativeQuery("""
                    INSERT INTO track_points (activity_id, seq, recorded_at, lat, lng, altitude_m, accuracy_m)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                    ON CONFLICT (activity_id, seq) DO NOTHING""")
                    .setParameter(1, p.activityId)
                    .setParameter(2, p.seq)
                    .setParameter(3, p.recordedAt)
                    .setParameter(4, p.lat)
                    .setParameter(5, p.lng)
                    .setParameter(6, p.altitudeM)
                    .setParameter(7, p.accuracyM)
                    .executeUpdate();
        }
        return inserted;
    }
}
