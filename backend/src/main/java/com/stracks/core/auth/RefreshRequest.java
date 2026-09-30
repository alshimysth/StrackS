package com.stracks.core.auth;

import jakarta.validation.constraints.NotBlank;

/**
 * Body of {@code POST /auth/refresh} and {@code POST /auth/logout}.
 *
 * <p>No user id is accepted from the client: the user is always derived from the database
 * row holding the hash of the presented token. That's what makes the endpoint immune to
 * IDOR: there is nothing to substitute.
 */
public record RefreshRequest(@NotBlank String refreshToken) {
}
