package com.stracks.sports.running;

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
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

/** Trail and treadmill next to road running: same family, three ways of recording. */
@QuarkusTest
class RunningFamilyTest {

    private static String freshToken() {
        return AuthResourceTest.register("run-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    private static String start(String token, String sport, Instant start) {
        return given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("sportType", sport, "startedAt", start.toString()))
                .when().post("/api/v1/activities").then().statusCode(201).extract().path("id");
    }

    /** ~11.1 m every 6 s with a steep 1 m climb per point: a trail profile. */
    private static List<Map<String, Object>> climb(Instant start, int points) {
        List<Map<String, Object>> track = new ArrayList<>();
        for (int i = 0; i < points; i++) {
            track.add(Map.of("seq", i, "recordedAt", start.plusSeconds(i * 6L).toString(),
                    "lat", 45.0 + i * 0.0001, "lng", 5.0, "altitudeM", 800.0 + i * 1.0, "accuracyM", 5.0));
        }
        return track;
    }

    @Test
    void trail_run_adds_the_climb_per_kilometre_and_keeps_the_splits() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(3600);
        String id = start(token, "trail_running", start);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("points", climb(start, 200)))
                .when().post("/api/v1/activities/" + id + "/track-points").then().statusCode(201);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(1200).toString(), "durationS", 1194))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("distanceM", greaterThan(2100f))
                .body("metrics.elevationGainM", greaterThan(150))
                .body("metrics.elevationGainPerKmM", greaterThan(60))
                .body("metrics.avgPaceSecPerKm", greaterThan(0))
                .body("metrics.splits", hasSize(2));

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/records?sport=trail_running")
                .then().statusCode(200)
                .body("bySport[0].records.find { it.key == 'elevationGainM' }.value", greaterThan(150f));
    }

    @Test
    void treadmill_takes_the_reported_distance_and_derives_the_pace() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(1800);
        String id = start(token, "treadmill_running", start);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(1800).toString(), "durationS", 1800, "metrics", Map.of(
                        "distanceM", 6000, "inclinePct", 2)))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("distanceM", equalTo(6000.0f))
                .body("metrics.avgPaceSecPerKm", equalTo(300))
                .body("metrics.inclinePct", equalTo(2))
                .body("metrics", not(hasKey("elevationGainM")));

        // The reported distance is a record like a GPS one, and sums with road running.
        String road = start(token, "running", start.minusSeconds(86_400));
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.minusSeconds(86_400 - 600).toString(), "durationS", 600))
                .when().post("/api/v1/activities/" + road + "/stop").then().statusCode(200)
                .body("distanceM", nullValue()); // no track uploaded: no distance, not zero

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=all")
                .then().statusCode(200)
                .body("totalSessions", equalTo(2))
                .body("totals.distanceM", equalTo(6000.0f))
                .body("bySport.find { it.sportType == 'treadmill_running' }.totals", not(hasKey("elevationGainM")));
    }

    /**
     * Offline session closed before its track could be sent (PR #101 review): the late
     * upload completes the activity (distance, metrics) instead of leaving a track next
     * to an activity that claims none. A replayed batch changes nothing.
     */
    @Test
    void a_track_uploaded_after_the_stop_completes_the_activity() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(3600);
        String id = start(token, "running", start);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(1200).toString(), "durationS", 1194))
                .when().post("/api/v1/activities/" + id + "/stop").then().statusCode(200)
                .body("distanceM", nullValue());

        List<Map<String, Object>> track = climb(start, 200);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("points", track))
                .when().post("/api/v1/activities/" + id + "/track-points").then().statusCode(201)
                .body("inserted", equalTo(200));
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/activities/" + id).then().statusCode(200)
                .body("status", equalTo("completed"))
                .body("distanceM", greaterThan(2100f))
                .body("metrics.avgPaceSecPerKm", greaterThan(0))
                .body("metrics.splits", hasSize(2));

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("points", track))
                .when().post("/api/v1/activities/" + id + "/track-points").then().statusCode(201)
                .body("inserted", equalTo(0));
    }

    @Test
    void treadmill_refuses_a_track_shaped_report() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(600);
        String id = start(token, "treadmill_running", start);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(600).toString(), "metrics", Map.of("elevationGainM", 12)))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(422);
    }
}
