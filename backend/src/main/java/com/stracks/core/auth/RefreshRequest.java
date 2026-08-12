package com.stracks.core.auth;

import jakarta.validation.constraints.NotBlank;

/**
 * Corps de {@code POST /auth/refresh} et {@code POST /auth/logout}.
 *
 * <p>Aucun identifiant d'utilisateur n'est accepté du client : l'utilisateur est toujours
 * déduit de la ligne en base portant l'empreinte du jeton présenté. C'est ce qui rend
 * l'endpoint insensible à l'IDOR — il n'y a rien à substituer.
 */
public record RefreshRequest(@NotBlank String refreshToken) {
}
