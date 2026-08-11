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
 * Détection de rejeu : un jeton de renouvellement déjà tourné qui ressort plus tard est
 * la signature d'un vol, et fait tomber toute la famille.
 *
 * <p>La fenêtre de tolérance au réessai réseau est ramenée à zéro par le profil ci-dessous —
 * sinon le rejeu immédiat que fait ce test serait (à juste titre) pris pour un réessai
 * légitime. Ce comportement-là est couvert par {@code RefreshTokenResourceTest}.
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
    void rejeu_d_un_jeton_deja_tourne_est_refuse_et_revoque_toute_la_famille() {
        String original = registerSession().getString("refreshToken");
        String rotated = refresh(original, 200).getString("refreshToken");

        // Le jeton consommé ressort : hors fenêtre de tolérance, c'est un vol.
        given().contentType("application/json")
                .body(Map.of("refreshToken", original))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(401)
                .contentType("application/problem+json")
                .body("status", equalTo(401));

        // Sanction : le jeton légitime tombe aussi. Le voleur ne garde pas la session,
        // et la victime est forcée de se reconnecter — le compromis assumé du pattern.
        refresh(rotated, 401);
    }

    @Test
    void un_jeton_revoque_ne_redevient_jamais_valide() {
        String original = registerSession().getString("refreshToken");
        refresh(original, 200);
        refresh(original, 401);
        refresh(original, 401);
    }
}
