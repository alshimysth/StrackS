package com.stracks.core.user;

import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.auth.AccountRequests;
import com.stracks.core.auth.AccountService;
import com.stracks.core.auth.AuthRateLimits;
import com.stracks.core.auth.AuthResource;
import com.stracks.core.auth.AuthResponse;
import com.stracks.core.common.ApiException;

import io.vertx.core.http.HttpServerRequest;

import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.PathParam;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.jwt.JsonWebToken;

@Path("/api/v1/users/me")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed("user")
public class UserResource {

    @Inject
    JsonWebToken jwt;

    @Inject
    PreferencesService preferences;

    @Inject
    AccountService account;

    @Inject
    AuthRateLimits limits;

    @Inject
    DataExportService export;

    private UserEntity currentUser() {
        UUID id = UUID.fromString(jwt.getSubject());
        UserEntity user = UserEntity.findById(id);
        if (user == null) {
            throw ApiException.notFound("Utilisateur");
        }
        return user;
    }

    @GET
    public UserResponse me() {
        return UserResponse.of(currentUser());
    }

    @PATCH
    @Transactional
    public UserResponse update(@Valid UpdateProfileRequest request) {
        UserEntity user = currentUser();
        if (request.displayName() != null) {
            user.displayName = request.displayName().isBlank() ? null : request.displayName().trim();
        }
        return UserResponse.of(user);
    }

    /**
     * Full preferences: the defaults, overridden by what the user saved. A new account
     * therefore gets a usable document, never an empty object the client would have to
     * interpret.
     */
    @GET
    @Path("/preferences")
    public ObjectNode preferences() {
        return preferences.withDefaults(currentUser().preferences);
    }

    /**
     * Partial update. A {@code null} value resets the preference to its default. An unknown
     * key is rejected with a 422: silently accepting a typo would create a preference
     * nobody will ever read.
     */
    @PATCH
    @Path("/preferences")
    @Transactional
    public ObjectNode updatePreferences(JsonNode patch) {
        UserEntity user = currentUser();
        user.preferences = preferences.merge(user.preferences, patch);
        return preferences.withDefaults(user.preferences);
    }

    // --- Account security (#73, #75) -------------------------------------------

    /**
     * Password change (#73). Returns a fresh session for this device; the other sessions
     * are revoked. Wrong current password → 403, never 401.
     */
    @POST
    @Path("/password")
    public AuthResponse changePassword(@Valid AccountRequests.ChangePassword request,
            @Context HttpServerRequest http) {
        limits.codeConfirm(AuthResource.clientIp(http)); // same family: a secret is checked
        return AuthResource.toResponse(
                account.changePassword(userId(), request.currentPassword(), request.newPassword()));
    }

    /** Verification of the current address (#75): (re)sends a code. 202 even if already verified. */
    @POST
    @Path("/email-verifications")
    @Consumes(MediaType.WILDCARD) // no body: the client sends no Content-Type
    public Response requestEmailVerification(@Context HttpServerRequest http) {
        limits.codeRequest(AuthResource.clientIp(http), "user:" + userId());
        account.requestEmailVerification(userId());
        return Response.accepted().build();
    }

    @POST
    @Path("/email-verification-confirmations")
    public UserResponse confirmEmailVerification(@Valid AccountRequests.CodeConfirmation request,
            @Context HttpServerRequest http) {
        limits.codeConfirm(AuthResource.clientIp(http));
        return UserResponse.of(account.confirmEmailVerification(userId(), request.code()));
    }

    /** Address change (#75): the code goes to the new address. */
    @POST
    @Path("/email-changes")
    public Response requestEmailChange(@Valid AccountRequests.EmailChange request,
            @Context HttpServerRequest http) {
        // "Account" key = the requester: without it, an account could flood any address
        // with codes by changing target on each request.
        limits.codeRequest(AuthResource.clientIp(http), "user:" + userId());
        account.requestEmailChange(userId(), request.newEmail(), request.currentPassword());
        return Response.accepted().build();
    }

    @POST
    @Path("/email-change-confirmations")
    public UserResponse confirmEmailChange(@Valid AccountRequests.CodeConfirmation request,
            @Context HttpServerRequest http) {
        limits.codeConfirm(AuthResource.clientIp(http));
        return UserResponse.of(account.confirmEmailChange(userId(), request.code()));
    }

    /** GDPR export (#76): everything the user entrusted to the app, as JSON. */
    @GET
    @Path("/export")
    public Response export() {
        String filename = "stracks-export-" + java.time.LocalDate.now() + ".json";
        return Response.ok(export.export(userId()), MediaType.APPLICATION_JSON)
                .header("Content-Disposition", "attachment; filename=\"" + filename + "\"")
                .build();
    }

    private UUID userId() {
        return UUID.fromString(jwt.getSubject());
    }

    @DELETE
    @Transactional
    public Response delete() {
        // ON DELETE CASCADE deletes activities and track_points (right to erasure)
        currentUser().delete();
        return Response.noContent().build();
    }
}
