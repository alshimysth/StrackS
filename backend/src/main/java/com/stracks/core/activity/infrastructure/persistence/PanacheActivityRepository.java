package com.stracks.core.activity.infrastructure.persistence;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.stracks.core.activity.application.ActivityRepository;
import com.stracks.core.activity.domain.ActivityEntity;

import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;

/** Panache adapter of {@link ActivityRepository}. */
@ApplicationScoped
public class PanacheActivityRepository implements ActivityRepository, PanacheRepositoryBase<ActivityEntity, UUID> {

    @Inject
    EntityManager em;

    @Override
    public Optional<ActivityEntity> findOwned(UUID activityId, UUID userId) {
        return find("id = ?1 and userId = ?2", activityId, userId).firstResultOptional();
    }

    @Override
    public Optional<ActivityEntity> findOne(UUID activityId) {
        return findByIdOptional(activityId);
    }

    @Override
    public void persist(ActivityEntity activity) {
        PanacheRepositoryBase.super.persist(activity);
    }

    @Override
    public void delete(ActivityEntity activity) {
        PanacheRepositoryBase.super.delete(activity);
    }

    @Override
    public List<UUID> findIdsByUser(UUID userId) {
        return em.createQuery(
                "select a.id from ActivityEntity a where a.userId = ?1 order by a.startedAt", UUID.class)
                .setParameter(1, userId)
                .getResultList();
    }

    @Override
    public ActivityPage findPage(UUID userId, String sport, Instant from, Instant to, int page, int size) {
        StringBuilder query = new StringBuilder("userId = ?1");
        List<Object> params = new ArrayList<>(List.of(userId));
        if (sport != null) {
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
        PanacheQuery<ActivityEntity> q = find(query.toString(), Sort.descending("startedAt"), params.toArray());
        long total = q.count();
        return new ActivityPage(q.page(Page.of(page, size)).list(), total);
    }

    @Override
    public List<ActivityEntity> findCompleted(UUID userId, Instant from, Instant to, String sport) {
        StringBuilder query = new StringBuilder(
                "userId = ?1 and status = 'completed' and startedAt >= ?2 and startedAt < ?3");
        List<Object> params = new ArrayList<>(List.of(userId, from, to));
        if (sport != null) {
            params.add(sport);
            query.append(" and sportType = ?").append(params.size());
        }
        return list(query.toString(), params.toArray());
    }

    @Override
    public List<ActivityEntity> findCompletedChronological(UUID userId, String sport) {
        StringBuilder query = new StringBuilder("userId = ?1 and status = 'completed'");
        List<Object> params = new ArrayList<>(List.of(userId));
        if (sport != null) {
            params.add(sport);
            query.append(" and sportType = ?2");
        }
        // Chronological order: on equal values, the oldest session remains the holder.
        // `startedAt` comes from the client and may coincide; the id is a random UUID. So
        // the server-side recording instant breaks the tie (PR #80 review).
        return list(query.append(" order by startedAt, createdAt, id").toString(), params.toArray());
    }

    /**
     * {@code AT TIME ZONE} brings the instant back to local time before truncating, then
     * converts it back: without it weeks would be cut at UTC midnight, i.e. 2 a.m. in
     * French summer time.
     */
    @Override
    public List<TimelineRow> aggregateByBucket(UUID userId, Instant from, Instant to, String sport,
            String unit, String zoneId) {
        String sql = """
                select date_trunc(:unit, a.started_at at time zone :tz) at time zone :tz as bucket_start,
                       a.sport_type,
                       count(*) as sessions,
                       coalesce(sum(a.duration_s), 0) as duration_s,
                       coalesce(sum(a.distance_m), 0) as distance_m
                  from activities a
                 where a.user_id = :userId
                   and a.status = 'completed'
                   and a.started_at >= :from
                   and a.started_at < :to
                """
                + (sport != null ? "   and a.sport_type = :sport\n" : "")
                + " group by 1, 2 order by 1, 2";

        Query query = em.createNativeQuery(sql)
                .setParameter("unit", unit)
                .setParameter("tz", zoneId)
                .setParameter("userId", userId)
                .setParameter("from", from)
                .setParameter("to", to);
        if (sport != null) {
            query.setParameter("sport", sport);
        }

        List<TimelineRow> rows = new ArrayList<>();
        for (Object row : query.getResultList()) {
            Object[] cells = (Object[]) row;
            rows.add(new TimelineRow(
                    toInstant(cells[0]),
                    (String) cells[1],
                    ((Number) cells[2]).intValue(),
                    ((Number) cells[3]).longValue(),
                    toDouble(cells[4])));
        }
        return rows;
    }

    private static Instant toInstant(Object value) {
        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toInstant();
        }
        if (value instanceof java.time.OffsetDateTime offset) {
            return offset.toInstant();
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        throw new IllegalStateException("Unexpected time bound type: " + value.getClass());
    }

    private static double toDouble(Object value) {
        return value instanceof BigDecimal decimal ? decimal.doubleValue()
                : ((Number) value).doubleValue();
    }
}
