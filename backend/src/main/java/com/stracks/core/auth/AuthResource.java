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
        limits.login(clientIp(http), request.email()); // before BCrypt: a 429 costs nothing
        return toResponse(authService.login(request));
    }

    /**
     * Refreshes the session. Deliberately {@code @PermitAll}: the caller arrives precisely
     * because its access JWT has expired; requiring a valid Bearer here would make the
     * endpoint useless.
     */
    @POST
    @Path("/refresh")
    public AuthResponse refresh(@Valid RefreshRequest request, @Context HttpServerRequest http) {
        limits.refresh(clientIp(http));
        return toResponse(authService.refresh(request.refreshToken()));
    }

    /**
     * Logout: revokes the presented token's family on the server side. Also
     * {@code @PermitAll}, so that a logout succeeds even with an already expired JWT;
     * otherwise a refresh token would stay alive with no way to kill it.
     */
    @POST
    @Path("/logout")
    public Response logout(@Valid RefreshRequest request) {
        authService.logout(request.refreshToken());
        return Response.noContent().build();
    }

    /**
     * Forgotten password (#74): always 202, whether or not the address has an account.
     * Answering otherwise would turn this endpoint into a directory of existing accounts.
     */
    @POST
    @Path("/password-resets")
    public Response requestPasswordReset(@Valid AccountRequests.PasswordReset request,
            @Context HttpServerRequest http) {
        limits.codeRequest(clientIp(http), request.email());
        accountService.requestPasswordReset(request.email());
        return Response.accepted().build();
    }

    /** Every session is revoked: the user logs in again with the new password. */
    @POST
    @Path("/password-reset-confirmations")
    public Response confirmPasswordReset(@Valid AccountRequests.PasswordResetConfirmation request,
            @Context HttpServerRequest http) {
        limits.codeConfirm(clientIp(http));
        accountService.confirmPasswordReset(request.email(), request.code(), request.newPassword());
        return Response.noContent().build();
    }

    /**
     * Client IP. In prod, Quarkus rebuilds it from the headers forwarded by Traefik, and
     * only from a trusted proxy (see application.properties).
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
