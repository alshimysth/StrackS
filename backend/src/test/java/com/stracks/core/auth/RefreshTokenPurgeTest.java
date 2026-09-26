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
 * #50 : la table ne croît plus sans borne, et la purge ne touche jamais un jeton utile.
 *
 * <p>La purge est appelée avec un instant explicite plutôt que d'attendre l'ordonnanceur :
 * c'est la règle de sélection qui est testée, pas l'horloge.
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
    void ne_supprime_que_les_jetons_expires_depuis_plus_que_la_retention() {
        Instant now = Instant.parse("2026-09-26T12:00:00Z");
        UUID user = newUser();

        UUID oldExpired = token(user, now.minus(RETENTION).minusSeconds(1), true);
        UUID justInsideRetention = token(user, now.minus(RETENTION).plusSeconds(1), true);
        UUID expiredYesterday = token(user, now.minus(Duration.ofDays(1)), false);
        UUID stillValid = token(user, now.plus(Duration.ofDays(1)), false);
        UUID validButRevoked = token(user, now.plus(Duration.ofDays(1)), true);

        long deleted = purge.purge(now);

        assertTrue(deleted >= 1);
        assertNull(find(oldExpired), "expiré depuis plus de 30 j : purgé");
        assertNotNull(find(justInsideRetention), "à 1 s de la limite : conservé");
        assertNotNull(find(expiredYesterday), "expiré hier : conservé pour l'analyse d'incident");
        assertNotNull(find(stillValid), "valide : jamais touché");
        assertNotNull(find(validButRevoked), "révoqué mais pas expiré : sert la détection de rejeu");
    }

    /** `replaced_by` pointe sur des jetons purgés : le ON DELETE SET NULL de V5 doit tenir. */
    @Test
    void purger_un_maillon_ne_casse_pas_la_chaine_de_rotation() {
        Instant now = Instant.parse("2026-09-26T12:00:00Z");
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
    void un_second_passage_ne_supprime_plus_rien() {
        Instant now = Instant.parse("2027-01-01T00:00:00Z");
        purge.purge(now);
        assertEquals(0, purge.purge(now));
    }
}
