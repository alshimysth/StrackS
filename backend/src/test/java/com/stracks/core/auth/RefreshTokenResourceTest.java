package com.stracks.core.auth;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.path.json.JsonPath;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * Renouvellement de session (Story #44) : émission, rotation, révocation, et surtout
 * la garantie qui motive le ticket — l'expiration du JWT en pleine séance ne doit
 * coûter aucun point de tracé.
 *
 * <p>La détection de rejeu hors fenêtre de tolérance est couverte séparément par
 * {@link RefreshTokenReuseTest}, qui ramène la fenêtre à zéro.
 */
@QuarkusTest
class RefreshTokenResourceTest {

    private record Session(String token, String refreshToken, String email) {
    }

    private static Session register() {
        String email = "refresh-" + UUID.randomUUID() + "@example.com";
        JsonPath body = given().contentType("application/json")
                .body(Map.of("email", email, "password", "motdepasse8", "displayName", "Testeur"))
                .when().post("/api/v1/auth/register")
                .then().statusCode(201)
                .body("token", notNullValue())
                .body("refreshToken", notNullValue())
                .extract().jsonPath();
        return new Session(body.getString("token"), body.getString("refreshToken"), email);
    }

    private static JsonPath refresh(String refreshToken, int expectedStatus) {
        return given().contentType("application/json")
                .body(Map.of("refreshToken", refreshToken))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(expectedStatus)
                .extract().jsonPath();
    }

    private static void assertTokenBelongsTo(String accessToken, String email) {
        given().header("Authorization", "Bearer " + accessToken)
                .when().get("/api/v1/users/me")
                .then().statusCode(200)
                .body("email", equalTo(email));
    }

    @Test
    void login_delivre_aussi_un_refresh_token() {
        Session session = register();

        given().contentType("application/json")
                .body(Map.of("email", session.email(), "password", "motdepasse8"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(200)
                .body("token", notNullValue())
                .body("refreshToken", notNullValue())
                .body("refreshToken", not(equalTo(session.refreshToken())));
    }

    @Test
    void refresh_rend_un_acces_utilisable_et_tourne_le_jeton() {
        Session session = register();

        JsonPath renewed = refresh(session.refreshToken(), 200);
        String newAccess = renewed.getString("token");
        String rotated = renewed.getString("refreshToken");

        // Rotation : le jeton présenté est consommé, un autre le remplace.
        assertNotEquals(session.refreshToken(), rotated);
        // Le JWT rendu ouvre bien les ressources protégées, sur le bon compte.
        assertTokenBelongsTo(newAccess, session.email());
        assertEquals(session.email(), renewed.getString("user.email"));
    }

    @Test
    void refresh_enchaine_sur_plusieurs_rotations() {
        Session session = register();

        String current = session.refreshToken();
        for (int i = 0; i < 5; i++) {
            JsonPath renewed = refresh(current, 200);
            String next = renewed.getString("refreshToken");
            assertNotEquals(current, next);
            current = next;
        }
        assertTokenBelongsTo(refresh(current, 200).getString("token"), session.email());
    }

    @Test
    void refresh_avec_un_jeton_inconnu_est_401_problem_json() {
        given().contentType("application/json")
                .body(Map.of("refreshToken", "jeton-qui-n-existe-pas"))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(401)
                .contentType("application/problem+json")
                .body("status", equalTo(401))
                .body("title", notNullValue());
    }

    @Test
    void refresh_sans_jeton_est_400() {
        given().contentType("application/json")
                .body(Map.of("refreshToken", ""))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(400);
    }

    @Test
    void logout_revoque_la_session_cote_serveur() {
        Session session = register();

        given().contentType("application/json")
                .body(Map.of("refreshToken", session.refreshToken()))
                .when().post("/api/v1/auth/logout")
                .then().statusCode(204);

        refresh(session.refreshToken(), 401);
    }

    @Test
    void logout_revoque_toute_la_famille_pas_seulement_le_dernier_jeton() {
        Session session = register();
        String rotated = refresh(session.refreshToken(), 200).getString("refreshToken");

        // Déconnexion présentée avec le jeton courant…
        given().contentType("application/json")
                .body(Map.of("refreshToken", rotated))
                .when().post("/api/v1/auth/logout")
                .then().statusCode(204);

        // …aucun jeton de la famille ne survit, ni le courant ni son prédécesseur.
        refresh(rotated, 401);
        refresh(session.refreshToken(), 401);
    }

    @Test
    void logout_est_idempotent_et_muet_sur_un_jeton_inconnu() {
        // Répondre « connu / inconnu » ferait de l'endpoint un oracle de validité.
        given().contentType("application/json")
                .body(Map.of("refreshToken", "jeton-qui-n-existe-pas"))
                .when().post("/api/v1/auth/logout")
                .then().statusCode(204);
    }

    @Test
    void refresh_ignore_le_bearer_et_sert_le_proprietaire_du_jeton() {
        Session alice = register();
        Session bob = register();

        // Alice présente son propre Bearer avec le jeton de renouvellement de Bob.
        // L'identité servie doit venir de la ligne du jeton, jamais de la requête.
        JsonPath renewed = given().header("Authorization", "Bearer " + alice.token())
                .contentType("application/json")
                .body(Map.of("refreshToken", bob.refreshToken()))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(200)
                .body("user.email", equalTo(bob.email()))
                .extract().jsonPath();

        assertTokenBelongsTo(renewed.getString("token"), bob.email());
    }

    @Test
    void refresh_apres_suppression_du_compte_est_401() {
        Session session = register();

        given().header("Authorization", "Bearer " + session.token())
                .when().delete("/api/v1/users/me")
                .then().statusCode(204);

        refresh(session.refreshToken(), 401);
    }

    @Test
    void rejeu_immediat_dans_la_fenetre_de_tolerance_ne_deconnecte_pas() {
        // Cas courant en mobilité : la réponse de rotation se perd, le client réessaie
        // avec le jeton qu'il a encore. Le traiter comme un vol éjecterait l'utilisateur
        // en pleine séance — exactement ce que #44 doit empêcher.
        Session session = register();
        String rotated = refresh(session.refreshToken(), 200).getString("refreshToken");

        String recovered = refresh(session.refreshToken(), 200).getString("refreshToken");
        assertNotEquals(rotated, recovered);
        assertTokenBelongsTo(refresh(recovered, 200).getString("token"), session.email());
    }

    @Test
    void refresh_pendant_une_seance_active_ne_perd_aucun_point() {
        Session session = register();
        Instant start = Instant.now().minusSeconds(600);

        String activityId = given().header("Authorization", "Bearer " + session.token())
                .contentType("application/json")
                .body(Map.of("sportType", "running", "startedAt", start.toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201)
                .extract().path("id");

        // Premier lot envoyé avec le jeton d'origine.
        given().header("Authorization", "Bearer " + session.token())
                .contentType("application/json")
                .body(Map.of("points", track(start, 0)))
                .when().post("/api/v1/activities/" + activityId + "/track-points")
                .then().statusCode(201)
                .body("inserted", equalTo(25));

        // Le JWT expire ici : le client renouvelle en silence, séance toujours ouverte.
        JsonPath renewed = refresh(session.refreshToken(), 200);
        String newAccess = renewed.getString("token");

        // Second lot avec le nouveau jeton — c'est le rejeu que fait l'uploader mobile.
        given().header("Authorization", "Bearer " + newAccess)
                .contentType("application/json")
                .body(Map.of("points", track(start, 25)))
                .when().post("/api/v1/activities/" + activityId + "/track-points")
                .then().statusCode(201)
                .body("inserted", equalTo(25));

        // La séance se termine normalement et porte bien les 50 points des deux lots.
        given().header("Authorization", "Bearer " + newAccess)
                .contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(300).toString(), "durationS", 294))
                .when().post("/api/v1/activities/" + activityId + "/stop")
                .then().statusCode(200)
                .body("status", equalTo("completed"));

        given().header("Authorization", "Bearer " + newAccess)
                .when().get("/api/v1/activities/" + activityId + "/track-points")
                .then().statusCode(200)
                .body("size()", equalTo(50));
    }

    /** Tracé synthétique de 25 points, aligné sur celui de ActivityFlowTest. */
    private static List<Map<String, Object>> track(Instant start, int offsetSeq) {
        List<Map<String, Object>> points = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            int seq = offsetSeq + i;
            points.add(Map.of(
                    "seq", seq,
                    "recordedAt", start.plusSeconds(seq * 6L).toString(),
                    "lat", 45.0 + seq * 0.0001,
                    "lng", 5.0,
                    "altitudeM", 200.0 + seq * 0.2,
                    "accuracyM", 5.0));
        }
        return points;
    }
}
