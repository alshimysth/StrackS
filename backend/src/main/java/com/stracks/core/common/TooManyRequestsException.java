package com.stracks.core.common;

/** 429 RFC 7807, avec le délai à respecter rendu dans l'en-tête {@code Retry-After}. */
public class TooManyRequestsException extends ApiException {

    private final long retryAfterSeconds;

    public TooManyRequestsException(long retryAfterSeconds) {
        super(429, "Trop de tentatives",
                "Trop de tentatives rapprochées. Réessaie dans " + humanDelay(retryAfterSeconds) + ".");
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }

    private static String humanDelay(long seconds) {
        if (seconds < 60) {
            return seconds + " s";
        }
        long minutes = (seconds + 59) / 60;
        return minutes + " min";
    }
}
