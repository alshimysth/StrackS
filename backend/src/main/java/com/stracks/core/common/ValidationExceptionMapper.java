package com.stracks.core.common;

import java.util.List;
import java.util.Map;

import jakarta.validation.ConstraintViolationException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

@Provider
public class ValidationExceptionMapper implements ExceptionMapper<ConstraintViolationException> {

    @Override
    public Response toResponse(ConstraintViolationException e) {
        List<String> violations = e.getConstraintViolations().stream()
                .map(v -> v.getPropertyPath() + " : " + v.getMessage())
                .sorted()
                .toList();
        return Response.status(400)
                .type("application/problem+json")
                .entity(Map.of(
                        "type", "about:blank",
                        "title", "Requête invalide",
                        "status", 400,
                        "detail", String.join(" ; ", violations)))
                .build();
    }
}
