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
     * Préférences complètes : les défauts, écrasés par ce que l'utilisateur a
     * enregistré. Un compte neuf reçoit donc un document exploitable, jamais un
     * objet vide que le client devrait interpréter.
     */
    @GET
    @Path("/preferences")
    public ObjectNode preferences() {
        return preferences.withDefaults(currentUser().preferences);
    }

    /**
     * Mise à jour partielle. Une valeur {@code null} remet la préférence à son
     * défaut. Une clé inconnue est refusée en 422 — accepter silencieusement une
     * faute de frappe fabriquerait une préférence que personne ne lira jamais.
     */
    @PATCH
    @Path("/preferences")
    @Transactional
    public ObjectNode updatePreferences(JsonNode patch) {
        UserEntity user = currentUser();
        user.preferences = preferences.merge(user.preferences, patch);
        return preferences.withDefaults(user.preferences);
    }

    // --- Sécurité du compte (#73, #75) -------------------------------------------

    /**
     * Changement de mot de passe (#73). Rend une session neuve pour cet appareil ; les
     * autres sessions sont révoquées. Mauvais mot de passe actuel → 403, jamais 401.
     */
    @POST
    @Path("/password")
    public AuthResponse changePassword(@Valid AccountRequests.ChangePassword request,
            @Context HttpServerRequest http) {
        limits.codeConfirm(AuthResource.clientIp(http)); // même famille : un secret est vérifié
        return AuthResource.toResponse(
                account.changePassword(userId(), request.currentPassword(), request.newPassword()));
    }

    /** Vérification de l'adresse actuelle (#75) : (r)envoie un code. 202 même si déjà vérifiée. */
    @POST
    @Path("/email-verifications")
    @Consumes(MediaType.WILDCARD) // sans corps : le client n'envoie pas de Content-Type
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

    /** Changement d'adresse (#75) : le code part vers la nouvelle adresse. */
    @POST
    @Path("/email-changes")
    public Response requestEmailChange(@Valid AccountRequests.EmailChange request,
            @Context HttpServerRequest http) {
        // Clé « compte » = le demandeur : sans elle, un compte pourrait inonder n'importe
        // quelle adresse de codes en changeant de cible à chaque requête.
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

    /** Export RGPD (#76) : tout ce que l'utilisateur a confié à l'app, en JSON. */
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
        // ON DELETE CASCADE supprime activités et track_points (droit à l'effacement)
        currentUser().delete();
        return Response.noContent().build();
    }
}
