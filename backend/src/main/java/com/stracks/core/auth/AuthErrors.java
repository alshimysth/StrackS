package com.stracks.core.auth;

import com.stracks.core.common.ApiException;

/**
 * Session refresh errors, rendered as RFC 7807 by the common mapper.
 *
 * <p>These factories live here rather than in {@link ApiException} to keep
 * {@code core/common} neutral, and because the "revoked token / compromised family"
 * vocabulary only makes sense in {@code core/auth}.
 *
 * <p>On purpose, one and the same message covers "unknown", "expired" and "revoked":
 * telling the cases apart would give an attacker an oracle to test tokens.
 */
final class AuthErrors {

    private AuthErrors() {
    }

    static ApiException invalidRefreshToken() {
        return new ApiException(401, "Session expirée",
                "Le jeton de renouvellement est invalide ou n'est plus utilisable. Reconnectez-vous.");
    }
}
