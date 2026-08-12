package com.stracks.core.auth;

import com.stracks.core.user.UserResponse;

/**
 * @param token        JWT d'accès, porté en {@code Authorization: Bearer}
 * @param refreshToken secret opaque de renouvellement — à ranger dans le stockage
 *                     sécurisé de l'appareil, jamais dans un état applicatif persisté en clair
 */
public record AuthResponse(String token, String refreshToken, UserResponse user) {
}
