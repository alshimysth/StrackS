package com.stracks.core.activity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.stracks.core.auth.AuthResourceTest;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;

/**
 * Parcours complet : démarrer → tracé → pause/reprise → stop → historique → stats.
 * Vérifie aussi l'idempotence de l'upload de tracé et l'anti-IDOR.
 */
@QuarkusTest
class ActivityFlowTest {

    private static String freshToken() {
        return AuthResourceTest.register("flow-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    /** Tracé synthétique : ~500 m plein nord, montée régulière de 10 m. */
    private static List<Map<String, Object>> syntheticTrack(Instant start, int offsetSeq) {
        List<Map<String, Object>> points = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            points.add(Map.of(
                    "seq", offsetSeq + i,
                    "recordedAt", start.plusSeconds(i * 6L).toString(),
                    "lat", 45.0 + i * 0.0001,       // ≈ 11,1 m par pas
                    "lng", 5.0,
                    "altitudeM", 200.0 + i * 0.2,   // +10 m réguliers
                    "accuracyM", 5.0));
        }
        return points;
    }

    @Test
    void full_running_session_lifecycle() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(600);

        String activityId = given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("sportType", "running", "startedAt", start.toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201)
                .body("status", equalTo("in_progress"))
                .extract().path("id");

        // Upload du tracé — deux fois le même lot : le rejeu ne duplique rien
        List<Map<String, Object>> track = syntheticTrack(start, 0);
        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("points", track))
                .when().post("/api/v1/activities/" + activityId + "/track-points")
                .then().statusCode(201)
                .body("inserted", equalTo(50));

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("points", track))
                .when().post("/api/v1/activities/" + activityId + "/track-points")
                .then().statusCode(201)
                .body("inserted", equalTo(0)); // idempotent

        // Pause puis reprise
        given().header("Authorization", "Bearer " + token)
                .when().post("/api/v1/activities/" + activityId + "/pause")
                .then().statusCode(200).body("status", equalTo("paused"));
        given().header("Authorization", "Bearer " + token)
                .when().post("/api/v1/activities/" + activityId + "/resume")
                .then().statusCode(200).body("status", equalTo("in_progress"));

        // Stop : le serveur recalcule métriques et distance depuis le tracé
        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(300).toString(), "durationS", 294,
                        "notes", "Sortie test"))
                .when().post("/api/v1/activities/" + activityId + "/stop")
                .then().statusCode(200)
                .body("status", equalTo("completed"))
                .body("durationS", equalTo(294))
                .body("distanceM", notNullValue())
                .body("metrics.schemaVersion", equalTo(1))
                .body("metrics.elevationGainM", greaterThan(5))
                .body("metrics.avgPaceSecPerKm", greaterThan(0));

        // Historique
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/activities?sport=running")
                .then().statusCode(200)
                .body("items", hasSize(1))
                .body("items[0].id", equalTo(activityId));

        // Tracé relu
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/activities/" + activityId + "/track-points")
                .then().statusCode(200)
                .body("size()", equalTo(50));

        // Stats de la semaine
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=week")
                .then().statusCode(200)
                .body("totalSessions", equalTo(1))
                .body("bySport[0].sportType", equalTo("running"));
    }

    @Test
    void unknown_sport_is_422() {
        given().header("Authorization", "Bearer " + freshToken())
                .contentType("application/json")
                .body(Map.of("sportType", "quidditch", "startedAt", Instant.now().toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(422);
    }

    @Test
    void another_users_activity_is_404_not_403() {
        String tokenA = freshToken();
        String tokenB = freshToken();

        String activityId = given().header("Authorization", "Bearer " + tokenA)
                .contentType("application/json")
                .body(Map.of("sportType", "walking", "startedAt", Instant.now().toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201).extract().path("id");

        // Anti-IDOR : l'existence même de l'activité n'est pas révélée
        given().header("Authorization", "Bearer " + tokenB)
                .when().get("/api/v1/activities/" + activityId)
                .then().statusCode(404);
        given().header("Authorization", "Bearer " + tokenB)
                .when().delete("/api/v1/activities/" + activityId)
                .then().statusCode(404);
    }

    @Test
    void invalid_transition_is_409() {
        String token = freshToken();
        String activityId = given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("sportType", "running", "startedAt", Instant.now().toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201).extract().path("id");

        // resume sans pause préalable
        given().header("Authorization", "Bearer " + token)
                .when().post("/api/v1/activities/" + activityId + "/resume")
                .then().statusCode(409);
    }

    @Test
    void sport_types_lists_running_and_walking() {
        given().header("Authorization", "Bearer " + freshToken())
                .when().get("/api/v1/sport-types")
                .then().statusCode(200)
                .body("code", org.hamcrest.Matchers.hasItems("running", "walking"))
                .body("find { it.code == 'running' }.usesGps", equalTo(true));
    }

    @Test
    void offline_scenario_activity_created_a_posteriori() {
        // Cas « séance hors ligne » : création + tracé + stop envoyés après coup
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(3600);

        String activityId = given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("sportType", "walking", "startedAt", start.toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201).extract().path("id");

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("points", syntheticTrack(start, 0)))
                .when().post("/api/v1/activities/" + activityId + "/track-points")
                .then().statusCode(201);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(1800).toString(), "durationS", 1800))
                .when().post("/api/v1/activities/" + activityId + "/stop")
                .then().statusCode(200)
                .body("status", equalTo("completed"))
                .body("metrics.avgSpeedKmh", notNullValue());
    }
}
