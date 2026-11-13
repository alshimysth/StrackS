package com.stracks.sports.climbing;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.stracks.core.auth.AuthResourceTest;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

/**
 * A timed sport end to end: no track is uploaded, the client reports its climbs at stop,
 * the server derives the totals and the hardest send, and the stats name no distance.
 */
@QuarkusTest
class ClimbingSessionTest {

    private static String freshToken() {
        return AuthResourceTest.register("climb-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    private static String start(String token, String sport, Instant start) {
        return given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("sportType", sport, "startedAt", start.toString()))
                .when().post("/api/v1/activities").then().statusCode(201)
                .body("status", equalTo("in_progress")).extract().path("id");
    }

    @Test
    void bouldering_session_derives_counts_and_the_hardest_send() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(5400);
        String id = start(token, "bouldering", start);

        Map<String, Object> metrics = Map.of(
                "schemaVersion", 1,
                "location", "indoor",
                "climbs", List.of(
                        Map.of("grade", "6A", "result", "flash", "attempts", 1),
                        Map.of("grade", "6B+", "result", "send", "attempts", 4),
                        Map.of("grade", "7A", "result", "attempt", "attempts", 6),
                        Map.of("grade", "5+", "result", "flash")));

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(5400).toString(), "durationS", 5000, "metrics", metrics))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("status", equalTo("completed"))
                .body("distanceM", nullValue())
                .body("metrics.schemaVersion", equalTo(1))
                .body("metrics.location", equalTo("indoor"))
                .body("metrics.climbsCount", equalTo(4))
                .body("metrics.sendsCount", equalTo(3))
                .body("metrics.attemptsTotal", equalTo(12))
                .body("metrics.hardestSentGrade", equalTo("6B+"))
                .body("metrics.hardestSentOrdinal", equalTo(65))
                .body("metrics.climbs.size()", equalTo(4));

        // Stats: climbs and sends are the plugin's totals; no distance, no elevation.
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=all")
                .then().statusCode(200)
                .body("totalSessions", equalTo(1))
                .body("totals", hasKey("climbsCount"))
                .body("totals", hasKey("sendsCount"))
                .body("totals", not(hasKey("distanceM")))
                .body("totals.sendsCount", equalTo(3.0f))
                .body("bySport[0].sportType", equalTo("bouldering"));

        // Records: the hardest send, in the discipline's own unit.
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/records?sport=bouldering")
                .then().statusCode(200)
                .body("bySport[0].records.find { it.key == 'hardestSentOrdinal' }.unit", equalTo("grade"))
                .body("bySport[0].records.find { it.key == 'hardestSentOrdinal' }.value", equalTo(65.0f))
                .body("bySport[0].records.find { it.key == 'durationS' }.value", equalTo(5000.0f));
    }

    @Test
    void rope_climbing_uses_the_route_notation_and_its_own_send_styles() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(3600);
        String id = start(token, "rope_climbing", start);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(3600).toString(), "durationS", 3600, "metrics", Map.of(
                        "location", "outdoor",
                        "climbs", List.of(
                                Map.of("grade", "6a", "result", "onsight"),
                                Map.of("grade", "6c+", "result", "redpoint", "attempts", 3),
                                Map.of("grade", "7a", "result", "attempt", "attempts", 2)))))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("metrics.sendsCount", equalTo(2))
                .body("metrics.hardestSentGrade", equalTo("6c+"));
    }

    @Test
    void a_boulder_grade_is_refused_on_a_route_and_a_bad_style_is_named() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(600);
        String id = start(token, "rope_climbing", start);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(600).toString(), "metrics", Map.of(
                        "climbs", List.of(Map.of("grade", "6A", "result", "onsight")))))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(422)
                .body("detail", containsString("metrics.climbs[0].grade"));

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(600).toString(), "metrics", Map.of(
                        "climbs", List.of(Map.of("grade", "6a", "result", "send")))))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(422)
                .body("detail", containsString("metrics.climbs[0].result"));
    }

    /**
     * The schema and the parser agree (PR #101 review): a grade the pattern alone would
     * let through but the parser can't rank would be counted as a send with no hardest
     * grade. "6" has no letter, "5+" is a boulder notation.
     */
    @Test
    void a_grade_the_parser_cannot_rank_is_refused_in_both_disciplines() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(600);
        String route = start(token, "rope_climbing", start);
        for (String grade : List.of("6", "5+")) {
            given().header("Authorization", "Bearer " + token).contentType("application/json")
                    .body(Map.of("endedAt", start.plusSeconds(600).toString(), "metrics", Map.of(
                            "climbs", List.of(Map.of("grade", grade, "result", "onsight")))))
                    .when().post("/api/v1/activities/" + route + "/stop")
                    .then().statusCode(422)
                    .body("detail", containsString("metrics.climbs[0].grade"));
        }
        String boulder = start(token, "bouldering", start);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(600).toString(), "metrics", Map.of(
                        "climbs", List.of(Map.of("grade", "6", "result", "flash")))))
                .when().post("/api/v1/activities/" + boulder + "/stop")
                .then().statusCode(422)
                .body("detail", containsString("metrics.climbs[0].grade"));
    }

    @Test
    void editing_the_climbs_after_the_fact_recomputes_the_totals() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(3600);
        String id = start(token, "bouldering", start);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(3600).toString(), "metrics", Map.of(
                        "climbs", List.of(Map.of("grade", "6A", "result", "send")))))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("metrics.sendsCount", equalTo(1));

        // The client echoes the full document back, derived keys included: accepted,
        // and the derived keys are recomputed from the new climbs rather than trusted.
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("metrics", Map.of(
                        "schemaVersion", 1,
                        "sendsCount", 99,
                        "climbs", List.of(
                                Map.of("grade", "6A", "result", "send"),
                                Map.of("grade", "6C", "result", "flash")))))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(200)
                .body("metrics.sendsCount", equalTo(2))
                .body("metrics.hardestSentGrade", equalTo("6C"));
    }

    @Test
    void a_session_without_any_climb_reported_is_still_a_valid_session() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(1800);
        String id = start(token, "bouldering", start);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(1800).toString()))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("metrics.climbsCount", equalTo(0))
                .body("metrics.sendsCount", equalTo(0))
                .body("metrics", not(hasKey("hardestSentGrade")));
    }
}
