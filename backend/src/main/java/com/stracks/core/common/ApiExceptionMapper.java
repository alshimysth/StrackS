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
        Response.ResponseBuilder builder = Response.status(e.status());
        if (e instanceof TooManyRequestsException limited) {
            builder.header("Retry-After", limited.retryAfterSeconds());
        }
        return builder
                .type("application/problem+json")
                .entity(Map.of(
                        "type", "about:blank",
                        "title", e.title(),
                        "status", e.status(),
                        "detail", e.getMessage()))
                .build();
    }
}
