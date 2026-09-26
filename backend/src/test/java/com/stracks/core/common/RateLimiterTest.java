package com.stracks.core.common;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** #72 : la mécanique de fenêtre, sans HTTP ni horloge réelle. */
class RateLimiterTest {

    private static final RateLimiter.Limit THREE_PER_MINUTE = RateLimiter.Limit.parse("3/PT1M");
    private static final Instant T0 = Instant.parse("2026-09-26T10:00:00Z");

    @Test
    void refuse_au_dela_du_seuil_avec_le_delai_a_attendre() {
        RateLimiter limiter = new RateLimiter();
        for (int i = 0; i < 3; i++) {
            limiter.acquire("k", THREE_PER_MINUTE, T0.plusSeconds(i));
        }
        TooManyRequestsException refused = assertThrows(TooManyRequestsException.class,
                () -> limiter.acquire("k", THREE_PER_MINUTE, T0.plusSeconds(10)));
        // Le premier passage (T0) sort de la fenêtre à T0 + 60 s : reste 50 s, arrondi au-dessus.
        assertEquals(51, refused.retryAfterSeconds());
        assertEquals(429, refused.status());
    }

    /** Fenêtre glissante : la place se libère au fil des sorties, pas d'un coup à la minute pile. */
    @Test
    void la_fenetre_se_libere_au_fil_du_temps() {
        RateLimiter limiter = new RateLimiter();
        limiter.acquire("k", THREE_PER_MINUTE, T0);
        limiter.acquire("k", THREE_PER_MINUTE, T0.plusSeconds(30));
        limiter.acquire("k", THREE_PER_MINUTE, T0.plusSeconds(40));

        assertThrows(TooManyRequestsException.class,
                () -> limiter.acquire("k", THREE_PER_MINUTE, T0.plusSeconds(59)));
        assertDoesNotThrow(() -> limiter.acquire("k", THREE_PER_MINUTE, T0.plusSeconds(61)));
        assertThrows(TooManyRequestsException.class,
                () -> limiter.acquire("k", THREE_PER_MINUTE, T0.plusSeconds(62)));
    }

    /** Un client qui insiste pendant le blocage n'allonge pas sa peine. */
    @Test
    void une_requete_refusee_n_est_pas_comptee() {
        RateLimiter limiter = new RateLimiter();
        for (int i = 0; i < 3; i++) {
            limiter.acquire("k", THREE_PER_MINUTE, T0);
        }
        for (int i = 1; i <= 50; i++) {
            Instant at = T0.plusSeconds(i);
            assertThrows(TooManyRequestsException.class, () -> limiter.acquire("k", THREE_PER_MINUTE, at));
        }
        assertDoesNotThrow(() -> limiter.acquire("k", THREE_PER_MINUTE, T0.plus(Duration.ofSeconds(61))));
    }

    @Test
    void deux_cles_sont_isolees() {
        RateLimiter limiter = new RateLimiter();
        for (int i = 0; i < 3; i++) {
            limiter.acquire("login:ip:203.0.113.1", THREE_PER_MINUTE, T0);
        }
        assertThrows(TooManyRequestsException.class,
                () -> limiter.acquire("login:ip:203.0.113.1", THREE_PER_MINUTE, T0));
        assertDoesNotThrow(() -> limiter.acquire("login:ip:203.0.113.2", THREE_PER_MINUTE, T0));
    }

    @Test
    void lit_le_format_de_configuration() {
        RateLimiter.Limit limit = RateLimiter.Limit.parse("10/PT15M");
        assertEquals(10, limit.limit());
        assertEquals(Duration.ofMinutes(15), limit.window());
        assertTrue(assertThrows(IllegalArgumentException.class, () -> RateLimiter.Limit.parse("10"))
                .getMessage().contains("Seuil invalide"));
    }
}
