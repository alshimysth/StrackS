package com.stracks.core.activity.api;

import java.util.List;

import com.stracks.core.activity.application.SportRegistry;
import com.stracks.core.activity.api.SportTypeDtos.SportTypeResponse;

import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

/** The registry as the client sees it: this list drives the sport picker, never a hard-coded one. */
@Path("/api/v1/sport-types")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed("user")
public class SportTypeResource {

    @Inject
    SportRegistry registry;

    @GET
    public List<SportTypeResponse> list() {
        return registry.descriptors().stream().map(SportTypeResponse::of).toList();
    }
}
