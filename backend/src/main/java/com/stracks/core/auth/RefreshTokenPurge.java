package com.stracks.core.auth;

import java.time.Duration;
import java.time.Instant;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Refresh token purge (#50). Each rotation adds a row; with a refresh every 15 min (#49),
 * an active user produces about a hundred a day.
 *
 * <p>Only tokens <b>expired for more than</b> {@code retention-days} are deleted. A token
 * still valid is never touched, revoked or not: the {@code replaced_by} chain of a live
 * family serves replay detection. Past expiry, the retention keeps enough to investigate
 * an incident.
 *
 * <p>Run by the backend rather than by a deployment job: it's a business rule of
 * {@code core/auth}, it must run wherever the backend runs, tests included.
 */
@ApplicationScoped
public class RefreshTokenPurge {

    private static final Logger LOG = Logger.getLogger(RefreshTokenPurge.class);

    @ConfigProperty(name = "stracks.auth.refresh-purge.retention-days", defaultValue = "30")
    int retentionDays;

    @Scheduled(every = "{stracks.auth.refresh-purge.every}", delayed = "5m", identity = "refresh-token-purge")
    void scheduled() {
        purge(Instant.now());
    }

    /** @return the number of deleted tokens */
    @Transactional
    public long purge(Instant now) {
        Instant before = now.minus(Duration.ofDays(retentionDays));
        long deleted = RefreshTokenEntity.deleteExpiredBefore(before);
        LOG.infof("Refresh token purge: %d deleted, expired before %s", deleted, before);
        return deleted;
    }
}
