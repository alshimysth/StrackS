package com.stracks.core.common;

/**
 * Exception métier portée jusqu'au client en RFC 7807 (application/problem+json).
 */
public class ApiException extends RuntimeException {

    private final int status;
    private final String title;

    public ApiException(int status, String title, String detail) {
        super(detail);
        this.status = status;
        this.title = title;
    }

    public int status() {
        return status;
    }

    public String title() {
        return title;
    }

    public static ApiException emailAlreadyUsed() {
        return new ApiException(409, "Email déjà utilisé", "Un compte existe déjà avec cet email.");
    }

    public static ApiException invalidCredentials() {
        return new ApiException(401, "Identifiants invalides", "Email ou mot de passe incorrect.");
    }

    public static ApiException notFound(String what) {
        return new ApiException(404, "Ressource introuvable", what + " introuvable.");
    }

    public static ApiException unknownSport(String code) {
        return new ApiException(422, "Sport inconnu", "Le sport '" + code + "' n'est pas enregistré.");
    }

    public static ApiException invalidMetrics(String detail) {
        return new ApiException(422, "Métriques invalides", detail);
    }

    public static ApiException invalidTransition(String from, String action) {
        return new ApiException(409, "Transition invalide",
                "Impossible d'appliquer '" + action + "' à une activité au statut '" + from + "'.");
    }
}
