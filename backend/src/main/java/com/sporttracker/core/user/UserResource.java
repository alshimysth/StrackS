package com.sporttracker.core.user;

import java.util.UUID;

import com.sporttracker.core.common.ApiException;

import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
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

    @DELETE
    @Transactional
    public Response delete() {
        // ON DELETE CASCADE supprime activités et track_points (droit à l'effacement)
        currentUser().delete();
        return Response.noContent().build();
    }
}
