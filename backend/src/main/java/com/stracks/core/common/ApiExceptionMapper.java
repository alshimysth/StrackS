package com.stracks.core.common;

import java.util.Map;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

@Provider
public class ApiExceptionMapper implements ExceptionMapper<ApiException> {

    @Override
    public Response toResponse(ApiException e) {
        return Response.status(e.status())
                .type("application/problem+json")
                .entity(Map.of(
                        "type", "about:blank",
                        "title", e.title(),
                        "status", e.status(),
                        "detail", e.getMessage()))
                .build();
    }
}
