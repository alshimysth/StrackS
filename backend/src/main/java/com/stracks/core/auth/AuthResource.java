package com.stracks.core.auth;

import com.stracks.core.user.UserResponse;

import io.vertx.core.http.HttpServerRequest;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/api/v1/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@PermitAll
public class AuthResource {

    @Inject
    AuthService authService;

    @Inject
    AccountService accountService;

    @Inject
    AuthRateLimits limits;

    @POST
    @Path("/register")
    public Response register(@Valid RegisterRequest request, @Context HttpServerRequest http) {
        limits.register(clientIp(http));
        return Response.status(201).entity(toResponse(authService.register(request))).build();
    }

    @POST
    @Path("/login")
    public AuthResponse login(@Valid LoginRequest request, @Context HttpServerRequest http) {
        limits.login(clientIp(http), request.email()); // avant BCrypt : un 429 ne coûte rien
        return toResponse(authService.login(request));
    }

    /**
     * Renouvelle la session. Volontairement {@code @PermitAll} : l'appelant arrive
     * précisément parce que son JWT d'accès est expiré — exiger un Bearer valide ici
     * rendrait l'endpoint inutile.
     */
    @POST
    @Path("/refresh")
    public AuthResponse refresh(@Valid RefreshRequest request, @Context HttpServerRequest http) {
        limits.refresh(clientIp(http));
        return toResponse(authService.refresh(request.refreshToken()));
    }

    /**
     * Déconnexion : révoque la famille du jeton présenté côté serveur. Également
     * {@code @PermitAll}, pour qu'une déconnexion aboutisse même avec un JWT déjà expiré —
     * sinon un jeton de renouvellement resterait vivant sans moyen de le tuer.
     */
    @POST
    @Path("/logout")
    public Response logout(@Valid RefreshRequest request) {
        authService.logout(request.refreshToken());
        return Response.noContent().build();
    }

    /**
     * Mot de passe oublié (#74) : toujours 202, que l'adresse ait un compte ou non.
     * Répondre autrement ferait de cet endpoint un annuaire des comptes existants.
     */
    @POST
    @Path("/password-resets")
    public Response requestPasswordReset(@Valid AccountRequests.PasswordReset request,
            @Context HttpServerRequest http) {
        limits.codeRequest(clientIp(http), request.email());
        accountService.requestPasswordReset(request.email());
        return Response.accepted().build();
    }

    /** Toutes les sessions sont révoquées : l'utilisateur se reconnecte avec le nouveau mot de passe. */
    @POST
    @Path("/password-reset-confirmations")
    public Response confirmPasswordReset(@Valid AccountRequests.PasswordResetConfirmation request,
            @Context HttpServerRequest http) {
        limits.codeConfirm(clientIp(http));
        accountService.confirmPasswordReset(request.email(), request.code(), request.newPassword());
        return Response.noContent().build();
    }

    /**
     * IP du client. En prod, Quarkus la reconstruit depuis les en-têtes transférés par
     * Traefik — et seulement depuis un proxy de confiance (voir application.properties).
     */
    public static String clientIp(HttpServerRequest http) {
        if (http == null || http.remoteAddress() == null) {
            return "unknown";
        }
        return http.remoteAddress().hostAddress();
    }

    public static AuthResponse toResponse(AuthService.AuthResult result) {
        return new AuthResponse(result.token(), result.refreshToken(), UserResponse.of(result.user()));
    }
}
