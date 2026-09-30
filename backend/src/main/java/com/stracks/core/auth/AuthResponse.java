package com.stracks.core.auth;

import com.stracks.core.user.UserResponse;

/**
 * @param token        access JWT, sent as {@code Authorization: Bearer}
 * @param refreshToken opaque refresh secret, to be kept in the device's secure storage,
 *                     never in app state persisted in clear text
 */
public record AuthResponse(String token, String refreshToken, UserResponse user) {
}
