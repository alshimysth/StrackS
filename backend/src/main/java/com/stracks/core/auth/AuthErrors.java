package com.stracks.core.auth;

import com.stracks.core.common.ApiException;

/**
 * Erreurs propres au renouvellement de session, rendues en RFC 7807 par le mapper commun.
 *
 * <p>Ces fabriques vivent ici plutôt que dans {@link ApiException} pour garder
 * {@code core/common} neutre — et parce que le vocabulaire « jeton révoqué / famille
 * compromise » n'a de sens que dans {@code core/auth}.
 *
 * <p>Volontairement, un seul et même message couvre « inconnu », « expiré » et « révoqué » :
 * distinguer les cas donnerait à un attaquant un oracle pour tester des jetons.
 */
final class AuthErrors {

    private AuthErrors() {
    }

    static ApiException invalidRefreshToken() {
        return new ApiException(401, "Session expirée",
                "Le jeton de renouvellement est invalide ou n'est plus utilisable. Reconnectez-vous.");
    }
}
