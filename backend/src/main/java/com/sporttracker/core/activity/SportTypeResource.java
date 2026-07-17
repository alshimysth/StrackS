package com.sporttracker.core.activity;

import java.util.List;

import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/v1/sport-types")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed("user")
public class SportTypeResource {

    @Inject
    SportRegistry registry;

    @GET
    public List<SportTypeDescriptor> list() {
        return registry.descriptors();
    }
}
