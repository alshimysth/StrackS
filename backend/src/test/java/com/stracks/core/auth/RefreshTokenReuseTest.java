package com.stracks.core.auth;

import java.util.Map;
import java.util.UUID;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.restassured.path.json.JsonPath;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

/**
 * Replay detection: an already rotated refresh token that shows up later is the signature
 * of a theft, and brings down the whole family.
 *
 * <p>The network retry grace window is brought down to zero by the profile below;
 * otherwise the immediate replay this test does would (rightly) be taken for a legitimate
 * retry. That behaviour is covered by {@code RefreshTokenResourceTest}.
 */
@QuarkusTest
@TestProfile(RefreshTokenReuseTest.NoGraceProfile.class)
class RefreshTokenReuseTest {

    public static class NoGraceProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("stracks.jwt.refresh-replay-grace-seconds", "0");
        }
    }

    private static JsonPath registerSession() {
        return given().contentType("application/json")
                .body(Map.of("email", "reuse-" + UUID.randomUUID() + "@example.com",
                        "password", "motdepasse8", "displayName", "Testeur"))
                .when().post("/api/v1/auth/register")
                .then().statusCode(201)
                .extract().jsonPath();
    }

    private static JsonPath refresh(String refreshToken, int expectedStatus) {
        return given().contentType("application/json")
                .body(Map.of("refreshToken", refreshToken))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(expectedStatus)
                .extract().jsonPath();
    }

    @Test
    void replaying_an_already_rotated_token_is_rejected_and_revokes_the_whole_family() {
        String original = registerSession().getString("refreshToken");
        String rotated = refresh(original, 200).getString("refreshToken");

        // The consumed token shows up again: outside the grace window, it's a theft.
        given().contentType("application/json")
                .body(Map.of("refreshToken", original))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(401)
                .contentType("application/problem+json")
                .body("status", equalTo(401));

        // Sanction: the legitimate token falls too. The thief doesn't keep the session,
        // and the victim is forced to log in again, the pattern's accepted trade-off.
        refresh(rotated, 401);
    }

    @Test
    void a_revoked_token_never_becomes_valid_again() {
        String original = registerSession().getString("refreshToken");
        refresh(original, 200);
        refresh(original, 401);
        refresh(original, 401);
    }
}
