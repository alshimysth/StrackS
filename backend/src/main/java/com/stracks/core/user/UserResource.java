package com.stracks.core.user;

import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.common.ApiException;

import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.PathParam;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
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

    @DELETE
    @Transactional
    public Response delete() {
        // ON DELETE CASCADE supprime activités et track_points (droit à l'effacement)
        currentUser().delete();
        return Response.noContent().build();
    }
}
