package com.stracks.core.activity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.stracks.core.auth.AuthResourceTest;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.path.json.JsonPath;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Personal records (#61): exact whatever the number of sessions, computed on values
 * recomputed by the server, never on partial data.
 */
@QuarkusTest
class PersonalRecordsTest {

    private static String freshToken() {
        return AuthResourceTest.register("records-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    /**
     * Completed session of {@code points} points due north (≈ 11.1 m per step, 6 s per
     * step): distance and duration grow with {@code points}. The distance is recomputed by
     * the server at stop, never provided.
     */
    static String session(String token, String sport, Instant start, int points) {
        String id = given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("sportType", sport, "startedAt", start.toString()))
                .when().post("/api/v1/activities").then().statusCode(201).extract().path("id");
        List<Map<String, Object>> track = new ArrayList<>();
        for (int i = 0; i < points; i++) {
            track.add(Map.of("seq", i, "recordedAt", start.plusSeconds(i * 6L).toString(),
                    "lat", 45.0 + i * 0.0001, "lng", 5.0, "altitudeM", 200.0, "accuracyM", 5.0));
        }
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("points", track))
                .when().post("/api/v1/activities/" + id + "/track-points").then().statusCode(201);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(points * 6L).toString(), "durationS", points * 6))
                .when().post("/api/v1/activities/" + id + "/stop").then().statusCode(200);
        return id;
    }

    static JsonPath records(String token, String sport) {
        var request = given().header("Authorization", "Bearer " + token);
        if (sport != null) {
            request = request.queryParam("sport", sport);
        }
        return request.when().get("/api/v1/stats/records").then().statusCode(200).extract().jsonPath();
    }

    static Map<String, Object> record(JsonPath json, String sport, String key) {
        List<Map<String, Object>> sports = json.getList("bySport");
        for (Map<String, Object> s : sports) {
            if (sport.equals(s.get("sportType"))) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> records = (List<Map<String, Object>>) s.get("records");
                return records.stream().filter(r -> key.equals(r.get("key"))).findFirst().orElse(null);
            }
        }
        return null;
    }

    /**
     * The case that motivated the ticket: the record is held by an old session, well past
     * the first history page (20 sessions). A partial read would get it wrong; the server
     * doesn't.
     */
    @Test
    void the_record_is_exact_beyond_the_first_history_page() {
        String token = freshToken();
        Instant t0 = Instant.parse("2025-01-01T08:00:00Z");
        String oldRecord = null;
        for (int i = 0; i < 25; i++) {
            int points = i == 2 ? 60 : 10 + (i % 5);
            String id = session(token, "running", t0.plusSeconds(i * 86_400L), points);
            if (i == 2) {
                oldRecord = id;
            }
        }

        JsonPath json = records(token, null);
        assertEquals(oldRecord, record(json, "running", "distanceM").get("activityId"));
        assertEquals(oldRecord, record(json, "running", "durationS").get("activityId"));
        assertEquals(25, (int) json.getInt("bySport[0].sessions"));
        assertEquals("Plus longue distance", record(json, "running", "distanceM").get("label"));
    }

    /** Equalling your record doesn't beat it: today's session doesn't become the holder. */
    @Test
    void equalling_a_record_does_not_beat_it_and_exceeding_it_does() {
        String token = freshToken();
        Instant t0 = Instant.parse("2025-03-01T08:00:00Z");
        String first = session(token, "running", t0, 30);
        session(token, "running", t0.plusSeconds(86_400), 30);

        assertEquals(first, record(records(token, "running"), "running", "distanceM").get("activityId"));

        String better = session(token, "running", t0.plusSeconds(2 * 86_400), 31);
        assertEquals(better, record(records(token, "running"), "running", "distanceM").get("activityId"));
    }

    /**
     * Same `startedAt`, same distance: the first recorded session keeps the record,
     * whatever the order of their UUIDs. Repeated so that UUID randomness can't make the
     * test pass by luck.
     */
    @Test
    void with_the_same_start_the_first_recorded_session_keeps_the_record() {
        for (int attempt = 0; attempt < 5; attempt++) {
            String token = freshToken();
            Instant same = Instant.parse("2025-04-01T08:00:00Z");
            String first = session(token, "running", same, 30);
            session(token, "running", same, 30);
            assertEquals(first, record(records(token, "running"), "running", "distanceM").get("activityId"));
        }
    }

    @Test
    void records_are_kept_per_sport_and_do_not_mix_accounts() {
        String token = freshToken();
        String other = freshToken();
        Instant t0 = Instant.parse("2025-06-01T08:00:00Z");
        String run = session(token, "running", t0, 20);
        String walk = session(token, "walking", t0.plusSeconds(3_600), 25);
        session(other, "running", t0, 200); // another account's record: invisible here

        JsonPath json = records(token, null);
        assertEquals(run, record(json, "running", "distanceM").get("activityId"));
        assertEquals(walk, record(json, "walking", "distanceM").get("activityId"));

        JsonPath onlyWalking = records(token, "walking");
        assertEquals(1, onlyWalking.getList("bySport").size());
        assertNull(record(onlyWalking, "running", "distanceM"));
    }

    @Test
    void an_account_without_sessions_has_no_record() {
        assertTrue(records(freshToken(), null).getList("bySport").isEmpty());
    }

    @Test
    void an_unknown_sport_is_rejected() {
        given().header("Authorization", "Bearer " + freshToken()).queryParam("sport", "curling")
                .when().get("/api/v1/stats/records").then().statusCode(422);
    }
}
