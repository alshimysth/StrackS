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

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * #87: expired codes disappear, usable codes never do. Purge at the real clock, like
 * {@link RefreshTokenPurgeTest}: the database is shared between suites.
 */
@QuarkusTest
class AccountCodePurgeTest {

    @Inject
    AccountCodePurge purge;

    @Transactional
    UUID newUser() {
        UserEntity user = new UserEntity();
        user.email = "codes-" + UUID.randomUUID() + "@example.com";
        user.passwordHash = BcryptUtil.bcryptHash("motdepasse8");
        user.persist();
        return user.id;
    }

    @Transactional
    UUID code(UUID userId, Instant expiresAt) {
        AccountCodeEntity code = new AccountCodeEntity();
        code.userId = userId;
        code.purpose = "email-change";
        code.codeHash = "$2a$10$empreinte-de-test";
        code.targetEmail = "nouvelle-" + UUID.randomUUID() + "@example.com";
        code.expiresAt = expiresAt;
        code.persist();
        return code.id;
    }

    @Transactional
    AccountCodeEntity find(UUID id) {
        return AccountCodeEntity.findById(id);
    }

    @Test
    void only_deletes_codes_expired_for_more_than_seven_days() {
        Instant now = Instant.now();
        UUID user = newUser();
        UUID old = code(user, now.minus(Duration.ofDays(7)).minusSeconds(60));
        UUID recent = code(user, now.minus(Duration.ofDays(7)).plusSeconds(60));
        UUID usable = code(user, now.plus(Duration.ofMinutes(30)));

        purge.purge(now);

        assertNull(find(old), "expired for more than 7 days: purged, requested address included");
        assertNotNull(find(recent), "just under the limit: kept for incident analysis");
        assertNotNull(find(usable), "still usable: never touched");
    }
}
