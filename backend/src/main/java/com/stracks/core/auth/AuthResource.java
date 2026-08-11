package com.stracks.core.auth;

import com.stracks.core.user.UserResponse;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/api/v1/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@PermitAll
public class AuthResource {

    @Inject
    AuthService authService;

    @POST
    @Path("/register")
    public Response register(@Valid RegisterRequest request) {
        return Response.status(201).entity(toResponse(authService.register(request))).build();
    }

    @POST
    @Path("/login")
    public AuthResponse login(@Valid LoginRequest request) {
        return toResponse(authService.login(request));
    }

    /**
     * Renouvelle la session. Volontairement {@code @PermitAll} : l'appelant arrive
     * précisément parce que son JWT d'accès est expiré — exiger un Bearer valide ici
     * rendrait l'endpoint inutile.
     */
    @POST
    @Path("/refresh")
    public AuthResponse refresh(@Valid RefreshRequest request) {
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

    private static AuthResponse toResponse(AuthService.AuthResult result) {
        return new AuthResponse(result.token(), result.refreshToken(), UserResponse.of(result.user()));
    }
}
