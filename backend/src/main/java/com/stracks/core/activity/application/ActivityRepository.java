package com.stracks.core.activity.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.stracks.core.activity.domain.ActivityEntity;

/**
 * Persistence port of the activity context. The application layer only knows this
 * interface; the Panache implementation lives in {@code infrastructure/persistence}.
 *
 * <p>Every read is scoped to a user: the anti-IDOR rule isn't a check added in the
 * resource, it's the shape of the queries.
 */
public interface ActivityRepository {

    Optional<ActivityEntity> findOwned(UUID activityId, UUID userId);

    Optional<ActivityEntity> findOne(UUID activityId);

    void persist(ActivityEntity activity);

    void delete(ActivityEntity activity);

    /** Identifiers of a user's activities, oldest first (data export). */
    List<UUID> findIdsByUser(UUID userId);

    /** One page of the history, most recent first. */
    ActivityPage findPage(UUID userId, String sport, Instant from, Instant to, int page, int size);

    /** Completed activities within {@code [from, to[}, optionally of one sport, in no particular order. */
    List<ActivityEntity> findCompleted(UUID userId, Instant from, Instant to, String sport);

    /**
     * Whole completed history, oldest first with a deterministic tie-break: on equal values
     * the oldest session keeps a record.
     */
    List<ActivityEntity> findCompletedChronological(UUID userId, String sport);

    /**
     * Time bucketing of the core columns, done by the database. {@code unit} is a
     * {@code date_trunc} unit (day, week, month); {@code zoneId} an IANA identifier.
     */
    List<TimelineRow> aggregateByBucket(UUID userId, Instant from, Instant to, String sport,
            String unit, String zoneId);

    record ActivityPage(List<ActivityEntity> items, long total) {
    }

    record TimelineRow(Instant bucketStart, String sportType, int sessions, long durationS, double distanceM) {
    }
}
