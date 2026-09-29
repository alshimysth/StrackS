package com.stracks.core.common;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * In-memory sliding-window rate limiter (#72).
 *
 * <p>In memory because prod runs <b>a single</b> backend: a shared counter (Redis) would
 * bring nothing but a dependency. The day there are two instances, each will apply its
 * own limit; the effective threshold will double, which is still a protection, not a hole.
 *
 * <p>Sliding rather than fixed window: a fixed window lets twice the threshold through
 * across two windows, precisely what a credential-stuffing script exploits.
 */
@ApplicationScoped
public class RateLimiter {

    /** Threshold: {@code limit} requests per {@code window}. */
    public record Limit(int limit, Duration window) {

        /** Configuration format: {@code 10/PT15M}. */
        public static Limit parse(String spec) {
            String[] parts = spec.split("/", 2);
            if (parts.length != 2) {
                throw new IllegalArgumentException("Invalid threshold (expected n/PT…): " + spec);
            }
            int limit = Integer.parseInt(parts[0].trim());
            Duration window = Duration.parse(parts[1].trim());
            // A zero limit would crash the first request (500 instead of 429); a zero
            // window would silently disable the limiter. Both must fail startup, not pass
            // quietly.
            if (limit < 1) {
                throw new IllegalArgumentException("Invalid threshold (at least 1 request): " + spec);
            }
            if (window.isZero() || window.isNegative()) {
                throw new IllegalArgumentException("Invalid threshold (positive window expected): " + spec);
            }
            return new Limit(limit, window);
        }
    }

    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();

    /**
     * Counts a request for {@code key}, or rejects it.
     *
     * @throws TooManyRequestsException when the threshold is reached; the rejected request
     *         isn't counted, otherwise an insisting client would never get out of the block.
     */
    public void acquire(String key, Limit limit) {
        acquire(key, limit, Instant.now());
    }

    void acquire(String key, Limit limit, Instant now) {
        Deque<Instant> log = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (log) {
            Instant horizon = now.minus(limit.window());
            while (!log.isEmpty() && !log.peekFirst().isAfter(horizon)) {
                log.pollFirst();
            }
            if (log.size() >= limit.limit()) {
                Instant freedAt = log.peekFirst().plus(limit.window());
                long seconds = Math.max(1, Duration.between(now, freedAt).toSeconds() + 1);
                throw new TooManyRequestsException(seconds);
            }
            log.addLast(now);
        }
    }

    /**
     * Housekeeping: without it, every IP ever seen would keep an entry forever. A key
     * whose last hit is older than the longest configured window (1 h) can no longer
     * block anything.
     */
    @Scheduled(every = "10m", identity = "rate-limiter-cleanup")
    void evictIdle() {
        Instant horizon = Instant.now().minus(Duration.ofHours(2));
        hits.entrySet().removeIf(entry -> {
            Deque<Instant> log = entry.getValue();
            synchronized (log) {
                return log.isEmpty() || !log.peekLast().isAfter(horizon);
            }
        });
    }

    /** For tests: starts over from a blank state. */
    public void reset() {
        hits.clear();
    }
}
