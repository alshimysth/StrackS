package com.stracks.core.activity.application;

import java.util.List;
import java.util.UUID;

import com.stracks.core.activity.domain.TrackPointEntity;

/** Persistence port of the GPS track. */
public interface TrackPointRepository {

    /** Whole track of an activity, in sequence order. */
    List<TrackPointEntity> findByActivity(UUID activityId);

    /**
     * Inserts the points, ignoring those whose {@code (activity_id, seq)} already exists:
     * a replayed batch (network retry) is never duplicated.
     *
     * @return the number of points actually inserted
     */
    int insertIgnoringDuplicates(List<TrackPointEntity> points);
}
