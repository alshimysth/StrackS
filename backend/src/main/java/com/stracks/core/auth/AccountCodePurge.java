package com.stracks.core.auth;

import java.time.Duration;
import java.time.Instant;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Purge of one-time codes (#87). An expired code is useless, but its row keeps the user's
 * id and, for an email change, the requested new address in clear text: keeping it forever
 * would contradict data minimisation.
 *
 * <p>Only deletes codes expired for more than {@code retention-days}: a code that can
 * still be used is never touched, and the margin keeps enough to investigate an incident.
 */
@ApplicationScoped
public class AccountCodePurge {

    private static final Logger LOG = Logger.getLogger(AccountCodePurge.class);

    @ConfigProperty(name = "stracks.account.code.purge-retention-days", defaultValue = "7")
    int retentionDays;

    @Scheduled(every = "{stracks.account.code.purge-every}", delayed = "10m", identity = "account-code-purge")
    void scheduled() {
        purge(Instant.now());
    }

    /** @return the number of deleted codes */
    @Transactional
    public long purge(Instant now) {
        Instant before = now.minus(Duration.ofDays(retentionDays));
        long deleted = AccountCodeEntity.deleteExpiredBefore(before);
        LOG.infof("Account code purge: %d deleted, expired before %s", deleted, before);
        return deleted;
    }
}
