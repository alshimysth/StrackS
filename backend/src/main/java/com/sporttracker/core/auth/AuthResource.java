package com.sporttracker.core.auth;

import com.sporttracker.core.user.UserResponse;

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
        AuthService.AuthResult result = authService.register(request);
        return Response.status(201)
                .entity(new AuthResponse(result.token(), UserResponse.of(result.user())))
                .build();
    }

    @POST
    @Path("/login")
    public AuthResponse login(@Valid LoginRequest request) {
        AuthService.AuthResult result = authService.login(request);
        return new AuthResponse(result.token(), UserResponse.of(result.user()));
    }
}
