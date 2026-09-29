package com.stracks.core.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import com.stracks.core.user.UserEntity;

import io.quarkus.elytron.security.common.BcryptUtil;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #50: the table no longer grows without bound, and the purge never touches a useful token.
 *
 * <p>The purge is called with an explicit instant rather than waiting for the scheduler:
 * it's the selection rule being tested, not the clock.
 *
 * <p><b>Always the real clock</b> as the purge instant. The database is shared by every
 * {@code @QuarkusTest} suite and the purge doesn't filter by user: an instant in the future
 * would delete still-valid tokens of other suites, and their tests would fail depending on
 * the execution order (CodeRabbit review, PR #78).
 */
@QuarkusTest
class RefreshTokenPurgeTest {

    @Inject
    RefreshTokenPurge purge;

    private static final Duration RETENTION = Duration.ofDays(30);

    @Transactional
    UUID newUser() {
        UserEntity user = new UserEntity();
        user.email = "purge-" + UUID.randomUUID() + "@example.com";
        user.passwordHash = BcryptUtil.bcryptHash("motdepasse8");
        user.persist();
        return user.id;
    }

    @Transactional
    UUID token(UUID userId, Instant expiresAt, boolean revoked) {
        RefreshTokenEntity t = new RefreshTokenEntity();
        t.userId = userId;
        t.familyId = UUID.randomUUID();
        t.tokenHash = UUID.randomUUID().toString();
        t.issuedAt = expiresAt.minus(Duration.ofDays(60));
        t.expiresAt = expiresAt;
        if (revoked) {
            t.revoke(t.issuedAt.plusSeconds(900), RefreshTokenService.REASON_ROTATED);
        }
        t.persist();
        return t.id;
    }

    @Transactional
    RefreshTokenEntity find(UUID id) {
        return RefreshTokenEntity.findById(id);
    }

    @Test
    void only_deletes_tokens_expired_for_longer_than_the_retention() {
        Instant now = Instant.now();
        UUID user = newUser();

        UUID oldExpired = token(user, now.minus(RETENTION).minusSeconds(1), true);
        UUID justInsideRetention = token(user, now.minus(RETENTION).plusSeconds(1), true);
        UUID expiredYesterday = token(user, now.minus(Duration.ofDays(1)), false);
        UUID stillValid = token(user, now.plus(Duration.ofDays(1)), false);
        UUID validButRevoked = token(user, now.plus(Duration.ofDays(1)), true);

        long deleted = purge.purge(now);

        assertTrue(deleted >= 1);
        assertNull(find(oldExpired), "expired for more than 30 days: purged");
        assertNotNull(find(justInsideRetention), "1 s from the limit: kept");
        assertNotNull(find(expiredYesterday), "expired yesterday: kept for incident analysis");
        assertNotNull(find(stillValid), "valid: never touched");
        assertNotNull(find(validButRevoked), "revoked but not expired: serves replay detection");
    }

    /** `replaced_by` points to purged tokens: V5's ON DELETE SET NULL must hold. */
    @Test
    void purging_a_link_does_not_break_the_rotation_chain() {
        Instant now = Instant.now();
        UUID user = newUser();
        UUID purged = token(user, now.minus(Duration.ofDays(90)), true);
        UUID survivor = token(user, now.plus(Duration.ofDays(1)), true);
        link(survivor, purged);

        purge.purge(now);

        assertNull(find(purged));
        assertNull(find(survivor).replacedBy);
    }

    @Transactional
    void link(UUID from, UUID to) {
        RefreshTokenEntity entity = RefreshTokenEntity.findById(from);
        entity.replacedBy = to;
    }

    @Test
    void a_second_run_deletes_nothing_more() {
        Instant now = Instant.now();
        purge.purge(now);
        assertEquals(0, purge.purge(now));
    }
}
