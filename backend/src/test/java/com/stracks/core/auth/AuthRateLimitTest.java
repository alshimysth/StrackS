package com.stracks.core.auth;

import java.util.Map;
import java.util.UUID;

import com.stracks.core.common.RateLimiter;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

/**
 * #72 end to end: low thresholds, real HTTP routes. Every test request comes from
 * 127.0.0.1; isolation between IPs is proven by {@code RateLimiterTest}.
 */
@QuarkusTest
@TestProfile(AuthRateLimitTest.LowLimits.class)
class AuthRateLimitTest {

    public static class LowLimits implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "stracks.rate-limit.login-per-account", "3/PT1M",
                    "stracks.rate-limit.login-per-ip", "6/PT1M",
                    "stracks.rate-limit.code-request-per-account", "2/PT1H",
                    "stracks.rate-limit.refresh-per-ip", "1000/PT1M");
        }
    }

    @Inject
    RateLimiter limiter;

    @BeforeEach
    void reset() {
        limiter.reset();
    }

    private static String register() {
        String email = "rl-" + UUID.randomUUID() + "@example.com";
        given().contentType("application/json")
                .body(Map.of("email", email, "password", "motdepasse8"))
                .when().post("/api/v1/auth/register")
                .then().statusCode(201);
        return email;
    }

    private static io.restassured.response.ValidatableResponse login(String email, String password) {
        return given().contentType("application/json")
                .body(Map.of("email", email, "password", password))
                .when().post("/api/v1/auth/login")
                .then();
    }

    /**
     * The 429 hits even with the right password: the check runs before BCrypt, so the
     * limiter doesn't know (and must not know) whether the attempt would have succeeded.
     */
    @Test
    void beyond_the_threshold_login_answers_429_even_with_the_right_password() {
        String email = register();
        for (int i = 0; i < 3; i++) {
            login(email, "mauvais-mdp").statusCode(401);
        }
        login(email, "motdepasse8")
                .statusCode(429)
                .contentType(containsString("application/problem+json"))
                .header("Retry-After", notNullValue())
                .body("status", equalTo(429))
                .body("title", equalTo("Trop de tentatives"));
    }

    @Test
    void the_per_account_threshold_does_not_block_another_account() {
        String victim = register();
        String other = register();
        for (int i = 0; i < 3; i++) {
            login(victim, "mauvais-mdp").statusCode(401);
        }
        login(victim, "motdepasse8").statusCode(429);
        login(other, "motdepasse8").statusCode(200);
    }

    /** An address without an account is limited like the others: otherwise the 429 would reveal existence. */
    @Test
    void code_requests_are_capped_per_address_existing_or_not() {
        String ghost = "absent-" + UUID.randomUUID() + "@example.com";
        for (int i = 0; i < 2; i++) {
            given().contentType("application/json").body(Map.of("email", ghost))
                    .when().post("/api/v1/auth/password-resets").then().statusCode(202);
        }
        given().contentType("application/json").body(Map.of("email", ghost))
                .when().post("/api/v1/auth/password-resets").then().statusCode(429);
    }

    /** Refresh has its own, wide threshold: a legitimate session is never cut. */
    @Test
    void the_login_block_does_not_affect_refresh() {
        String email = register();
        String refresh = login(email, "motdepasse8").statusCode(200).extract().path("refreshToken");
        for (int i = 0; i < 3; i++) {
            login(email, "mauvais-mdp");
        }
        login(email, "motdepasse8").statusCode(429);
        given().contentType("application/json").body(Map.of("refreshToken", refresh))
                .when().post("/api/v1/auth/refresh").then().statusCode(200);
    }
}
