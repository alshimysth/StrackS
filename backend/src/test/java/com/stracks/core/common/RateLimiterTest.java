package com.stracks.core.common;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** #72: the window mechanics, without HTTP or a real clock. */
class RateLimiterTest {

    private static final RateLimiter.Limit THREE_PER_MINUTE = RateLimiter.Limit.parse("3/PT1M");
    private static final Instant T0 = Instant.parse("2026-09-26T10:00:00Z");

    @Test
    void rejects_beyond_the_threshold_with_the_delay_to_wait() {
        RateLimiter limiter = new RateLimiter();
        for (int i = 0; i < 3; i++) {
            limiter.acquire("k", THREE_PER_MINUTE, T0.plusSeconds(i));
        }
        TooManyRequestsException refused = assertThrows(TooManyRequestsException.class,
                () -> limiter.acquire("k", THREE_PER_MINUTE, T0.plusSeconds(10)));
        // The first hit (T0) leaves the window at T0 + 60 s: 50 s left, rounded up.
        assertEquals(51, refused.retryAfterSeconds());
        assertEquals(429, refused.status());
    }

    /** Sliding window: room frees up as hits leave, not all at once on the minute. */
    @Test
    void the_window_frees_up_over_time() {
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

    /** A client insisting during the block doesn't extend its sentence. */
    @Test
    void a_rejected_request_is_not_counted() {
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
    void two_keys_are_isolated() {
        RateLimiter limiter = new RateLimiter();
        for (int i = 0; i < 3; i++) {
            limiter.acquire("login:ip:203.0.113.1", THREE_PER_MINUTE, T0);
        }
        assertThrows(TooManyRequestsException.class,
                () -> limiter.acquire("login:ip:203.0.113.1", THREE_PER_MINUTE, T0));
        assertDoesNotThrow(() -> limiter.acquire("login:ip:203.0.113.2", THREE_PER_MINUTE, T0));
    }

    @Test
    void parses_the_configuration_format() {
        RateLimiter.Limit limit = RateLimiter.Limit.parse("10/PT15M");
        assertEquals(10, limit.limit());
        assertEquals(Duration.ofMinutes(15), limit.window());
        assertTrue(assertThrows(IllegalArgumentException.class, () -> RateLimiter.Limit.parse("10"))
                .getMessage().contains("Invalid threshold"));
    }

    /** An absurd configuration must fail startup, not the first request. */
    @Test
    void rejects_a_zero_threshold_or_a_non_positive_window() {
        for (String spec : new String[] {"0/PT1M", "-3/PT1M", "5/PT0S", "5/PT-1M"}) {
            assertThrows(IllegalArgumentException.class, () -> RateLimiter.Limit.parse(spec), spec);
        }
    }
}
