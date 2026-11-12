package com.stracks.sports.cycling;

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
import static org.hamcrest.Matchers.lessThan;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

/**
 * The cycling family: two GPS sports sharing the engine with running (distance,
 * elevation, max speed) and one trainer sport whose distance is reported, not measured.
 */
@QuarkusTest
class CyclingSessionTest {

    private static String freshToken() {
        return AuthResourceTest.register("bike-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    private static String start(String token, String sport, Instant start) {
        return given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("sportType", sport, "startedAt", start.toString()))
                .when().post("/api/v1/activities").then().statusCode(201).extract().path("id");
    }

    /** ~11.1 m every 2 s = 20 km/h due north, steady climb. */
    private static List<Map<String, Object>> ride(Instant start, int points) {
        List<Map<String, Object>> track = new ArrayList<>();
        for (int i = 0; i < points; i++) {
            track.add(Map.of("seq", i, "recordedAt", start.plusSeconds(i * 2L).toString(),
                    "lat", 45.0 + i * 0.0001, "lng", 5.0, "altitudeM", 300.0 + i * 0.3, "accuracyM", 5.0));
        }
        return track;
    }

    @Test
    void road_ride_recomputes_speed_max_speed_and_elevation_from_the_track() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(1200);
        String id = start(token, "cycling", start);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("points", ride(start, 300)))
                .when().post("/api/v1/activities/" + id + "/track-points").then().statusCode(201);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(600).toString(), "durationS", 598))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("distanceM", notNullValue())
                .body("distanceM", greaterThan(3200f))
                .body("metrics.avgSpeedKmh", greaterThan(19f))
                .body("metrics.avgSpeedKmh", lessThan(21f))
                .body("metrics.maxSpeedKmh", greaterThan(19f))
                .body("metrics.maxSpeedKmh", lessThan(21f))
                .body("metrics.elevationGainM", greaterThan(80))
                .body("metrics", not(hasKey("splits")));

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/records?sport=cycling")
                .then().statusCode(200)
                .body("bySport[0].records.find { it.key == 'elevationGainM' }.label", equalTo("Plus gros dénivelé"))
                .body("bySport[0].records.find { it.key == 'distanceM' }.value", greaterThan(3200f));
    }

    @Test
    void mountain_biking_shares_the_schema_and_tolerates_faster_segments_than_a_runner() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(1200);
        String id = start(token, "mountain_biking", start);
        // 22 m per 2 s = 40 km/h: implausible for a runner, kept for a rider.
        List<Map<String, Object>> track = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            track.add(Map.of("seq", i, "recordedAt", start.plusSeconds(i * 2L).toString(),
                    "lat", 45.0 + i * 0.0002, "lng", 5.0, "altitudeM", 300.0, "accuracyM", 5.0));
        }
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("points", track))
                .when().post("/api/v1/activities/" + id + "/track-points").then().statusCode(201);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(200).toString(), "durationS", 198))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("distanceM", greaterThan(2100f))
                .body("metrics.maxSpeedKmh", greaterThan(39f));
    }

    @Test
    void indoor_ride_takes_the_reported_distance_and_prefers_power_for_calories() {
        String token = freshToken();
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("physical", Map.of("weightKg", 75)))
                .when().patch("/api/v1/users/me/preferences").then().statusCode(200);

        Instant start = Instant.now().minusSeconds(3600);
        String id = start(token, "indoor_cycling", start);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(3600).toString(), "durationS", 3600, "metrics", Map.of(
                        "distanceM", 30000, "avgPowerW", 180, "avgCadenceRpm", 88)))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("distanceM", equalTo(30000.0f))
                .body("metrics.avgSpeedKmh", equalTo(30.0f))
                // 11 MET × 3.5 × 75 / 200 × 60 min = 866 kcal
                .body("calories", equalTo(866));

        // The reported distance feeds the timeline like a GPS one: it's the core column.
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=all")
                .then().statusCode(200)
                .body("totals.distanceM", equalTo(30000.0f))
                .body("totals", not(hasKey("elevationGainM")));
    }

    @Test
    void indoor_ride_without_any_report_has_no_distance_and_no_made_up_speed() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(1800);
        String id = start(token, "indoor_cycling", start);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(1800).toString()))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("distanceM", nullValue())
                .body("metrics", not(hasKey("avgSpeedKmh")));
    }
}
