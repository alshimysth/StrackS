package com.stracks.core.user;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** #76 : portabilité — tout ce qui appartient à l'utilisateur, rien d'autre, aucun secret. */
@QuarkusTest
class DataExportTest {

    record Account(String email, String token, String refreshToken) {
    }

    static Account register() {
        String email = "export-" + UUID.randomUUID() + "@example.com";
        JsonPath body = given().contentType("application/json")
                .body(Map.of("email", email, "password", "motdepasse8", "displayName", "Exporteur"))
                .when().post("/api/v1/auth/register")
                .then().statusCode(201).extract().jsonPath();
        return new Account(email, body.getString("token"), body.getString("refreshToken"));
    }

    static String activityWithPoints(Account a, int points) {
        Instant start = Instant.now().minusSeconds(3600);
        String id = given().header("Authorization", "Bearer " + a.token()).contentType("application/json")
                .body(Map.of("sportType", "running", "startedAt", start.toString()))
                .when().post("/api/v1/activities").then().statusCode(201).extract().path("id");
        List<Map<String, Object>> track = new ArrayList<>();
        for (int seq = 0; seq < points; seq++) {
            track.add(Map.of("seq", seq, "recordedAt", start.plusSeconds(seq * 6L).toString(),
                    "lat", 45.0 + seq * 0.0001, "lng", 5.0, "altitudeM", 200.0, "accuracyM", 5.0));
        }
        given().header("Authorization", "Bearer " + a.token()).contentType("application/json")
                .body(Map.of("points", track))
                .when().post("/api/v1/activities/" + id + "/track-points").then().statusCode(201);
        given().header("Authorization", "Bearer " + a.token()).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(points * 6L).toString(), "durationS", points * 6))
                .when().post("/api/v1/activities/" + id + "/stop").then().statusCode(200);
        return id;
    }

    static Response export(Account a) {
        return given().header("Authorization", "Bearer " + a.token())
                .when().get("/api/v1/users/me/export");
    }

    @Test
    void contient_toutes_les_activites_et_tous_les_points_et_rien_d_un_autre_compte() {
        Account me = register();
        Account other = register();
        String first = activityWithPoints(me, 30);
        String second = activityWithPoints(me, 12);
        String foreign = activityWithPoints(other, 20);

        Response response = export(me);
        response.then().statusCode(200)
                .header("Content-Disposition", containsString("attachment; filename=\"stracks-export-"));
        JsonPath json = response.jsonPath();

        assertEquals(1, json.getInt("formatVersion"));
        assertEquals(me.email(), json.getString("user.email"));
        assertEquals("metric", json.getString("preferences.units"));
        assertEquals(List.of(first, second), json.getList("activities.activity.id"));
        assertEquals(30, json.getList("activities[0].trackPoints").size());
        assertEquals(12, json.getList("activities[1].trackPoints").size());
        assertEquals(45.0011, json.getDouble("activities[1].trackPoints[11].lat"), 1e-9);
        assertFalse(response.asString().contains(foreign));
        assertFalse(response.asString().contains(other.email()));
    }

    @Test
    void ne_contient_aucun_secret_d_authentification() {
        Account me = register();
        activityWithPoints(me, 3);
        String body = export(me).then().statusCode(200).extract().asString();

        assertFalse(body.contains("$2a$") || body.contains("$2b$") || body.contains("$2y$"), "aucune empreinte BCrypt");
        assertFalse(body.contains(me.refreshToken()));
        assertFalse(body.contains(me.token()));
        assertFalse(body.toLowerCase().contains("password"));
    }

    @Test
    void un_compte_sans_activite_exporte_un_document_valide() {
        Account me = register();
        JsonPath json = export(me).then().statusCode(200).extract().jsonPath();
        assertTrue(json.getList("activities").isEmpty());
    }

    @Test
    void exige_une_authentification() {
        given().when().get("/api/v1/users/me/export").then().statusCode(401);
    }
}
