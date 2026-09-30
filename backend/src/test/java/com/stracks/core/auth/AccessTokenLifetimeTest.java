package com.stracks.core.auth;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;

/** #49: the access JWT issued by the real configuration lives 15 minutes, not 7 days. */
@QuarkusTest
class AccessTokenLifetimeTest {

    @Test
    void the_access_jwt_expires_in_15_minutes() throws Exception {
        String token = given().contentType("application/json")
                .body(Map.of("email", "ttl-" + UUID.randomUUID() + "@example.com",
                        "password", "motdepasse8"))
                .when().post("/api/v1/auth/register")
                .then().statusCode(201)
                .extract().path("token");

        String payload = new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]),
                StandardCharsets.UTF_8);
        JsonNode claims = new ObjectMapper().readTree(payload);
        assertEquals(900, claims.get("exp").asLong() - claims.get("iat").asLong());
    }
}
