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
 * #72 de bout en bout : seuils bas, vraies routes HTTP. Toutes les requêtes des tests
 * viennent de 127.0.0.1 ; l'isolation entre IP est prouvée par {@code RateLimiterTest}.
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
     * Le 429 tombe même avec le bon mot de passe : le contrôle passe avant BCrypt, donc le
     * limiteur ne sait pas — et ne doit pas savoir — si l'essai aurait réussi.
     */
    @Test
    void au_dela_du_seuil_login_repond_429_meme_avec_le_bon_mot_de_passe() {
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
    void le_seuil_par_compte_ne_bloque_pas_un_autre_compte() {
        String victim = register();
        String other = register();
        for (int i = 0; i < 3; i++) {
            login(victim, "mauvais-mdp").statusCode(401);
        }
        login(victim, "motdepasse8").statusCode(429);
        login(other, "motdepasse8").statusCode(200);
    }

    /** Une adresse sans compte est limitée comme les autres : sinon le 429 trahirait l'existence. */
    @Test
    void les_demandes_de_code_sont_plafonnees_par_adresse_existante_ou_non() {
        String ghost = "absent-" + UUID.randomUUID() + "@example.com";
        for (int i = 0; i < 2; i++) {
            given().contentType("application/json").body(Map.of("email", ghost))
                    .when().post("/api/v1/auth/password-resets").then().statusCode(202);
        }
        given().contentType("application/json").body(Map.of("email", ghost))
                .when().post("/api/v1/auth/password-resets").then().statusCode(429);
    }

    /** Le renouvellement a son propre seuil, large : une session légitime n'est jamais coupée. */
    @Test
    void le_blocage_du_login_ne_touche_pas_le_renouvellement() {
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
