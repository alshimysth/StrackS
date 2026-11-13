package com.stracks.sports.racket;

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
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

/** Racket sports: a timer plus a score; the server says who won and sums the matches. */
@QuarkusTest
class RacketSessionTest {

    private static String freshToken() {
        return AuthResourceTest.register("racket-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    private static String start(String token, String sport, Instant start) {
        return given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("sportType", sport, "startedAt", start.toString()))
                .when().post("/api/v1/activities").then().statusCode(201).extract().path("id");
    }

    private static void setWeight(String token, double kg) {
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("physical", Map.of("weightKg", kg)))
                .when().patch("/api/v1/users/me/preferences").then().statusCode(200);
    }

    @Test
    void tennis_match_derives_the_result_from_the_sets_and_estimates_calories() {
        String token = freshToken();
        setWeight(token, 70);
        Instant start = Instant.now().minusSeconds(5400);
        String id = start(token, "tennis", start);

        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(5400).toString(), "durationS", 5400, "metrics", Map.of(
                        "format", "singles",
                        "sets", List.of(Map.of("won", 6, "lost", 4), Map.of("won", 3, "lost", 6),
                                Map.of("won", 7, "lost", 6)))))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("status", equalTo("completed"))
                .body("distanceM", nullValue())
                .body("calories", notNullValue())
                .body("metrics.setsWon", equalTo(2))
                .body("metrics.setsLost", equalTo(1))
                .body("metrics.result", equalTo("win"));

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=all")
                .then().statusCode(200)
                .body("totalSessions", equalTo(1))
                .body("totalCalories", notNullValue())
                .body("totals.matchesWon", equalTo(1.0f))
                .body("totals.matchesLost", equalTo(0.0f))
                .body("totals.setsWon", equalTo(2.0f))
                .body("totals", not(hasKey("distanceM")));
    }

    @Test
    void a_tied_set_counts_for_nobody_and_no_set_means_no_result() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(3600);
        String drawn = start(token, "badminton", start);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(3600).toString(), "metrics", Map.of(
                        "format", "doubles",
                        "sets", List.of(Map.of("won", 21, "lost", 15), Map.of("won", 18, "lost", 21),
                                Map.of("won", 10, "lost", 10)))))
                .when().post("/api/v1/activities/" + drawn + "/stop")
                .then().statusCode(200)
                .body("metrics.result", equalTo("draw"));

        String unscored = start(token, "padel", start);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(3600).toString(), "metrics", Map.of("format", "doubles")))
                .when().post("/api/v1/activities/" + unscored + "/stop")
                .then().statusCode(200)
                .body("metrics.setsWon", equalTo(0))
                .body("metrics", not(hasKey("result")));
    }

    @Test
    void each_sport_has_its_own_set_bounds() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(600);

        // Tennis sets are counted in games: 21 is a badminton score.
        String tennis = start(token, "tennis", start);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(600).toString(), "metrics", Map.of(
                        "sets", List.of(Map.of("won", 21, "lost", 15)))))
                .when().post("/api/v1/activities/" + tennis + "/stop")
                .then().statusCode(422)
                .body("detail", containsString("metrics.sets[0].won"));

        // Table tennis goes to 7 games; a 4th set is fine there, not in padel.
        String padel = start(token, "padel", start);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(600).toString(), "metrics", Map.of(
                        "sets", List.of(Map.of("won", 6, "lost", 4), Map.of("won", 6, "lost", 4),
                                Map.of("won", 6, "lost", 4), Map.of("won", 6, "lost", 4)))))
                .when().post("/api/v1/activities/" + padel + "/stop")
                .then().statusCode(422)
                .body("detail", containsString("metrics.sets"));

        String squash = start(token, "squash", start);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(600).toString(), "metrics", Map.of(
                        "format", "singles", "score", "11-9")))
                .when().post("/api/v1/activities/" + squash + "/stop")
                .then().statusCode(422)
                .body("detail", containsString("score"));
    }

    /** An edit after the fact re-estimates the calories (PR #101 review): doubles cost less. */
    @Test
    void editing_the_format_after_the_fact_re_estimates_the_calories() {
        String token = freshToken();
        setWeight(token, 70);
        Instant start = Instant.now().minusSeconds(3600);
        String id = start(token, "tennis", start);
        int singles = given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(3600).toString(), "durationS", 3600,
                        "metrics", Map.of("format", "singles")))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200).extract().path("calories");

        int doubles = given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("metrics", Map.of("format", "doubles")))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(200).extract().path("calories");
        // 8.0 MET singles vs 6.0 MET doubles, same weight and duration.
        org.junit.jupiter.api.Assertions.assertEquals(588, singles);
        org.junit.jupiter.api.Assertions.assertEquals(441, doubles);
    }

    @Test
    void table_tennis_is_registered_and_closes_like_the_others() {
        String token = freshToken();
        Instant start = Instant.now().minusSeconds(1200);
        String id = start(token, "table_tennis", start);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("endedAt", start.plusSeconds(1200).toString(), "metrics", Map.of(
                        "sets", List.of(Map.of("won", 11, "lost", 9), Map.of("won", 9, "lost", 11),
                                Map.of("won", 13, "lost", 11), Map.of("won", 11, "lost", 7)))))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200)
                .body("metrics.setsWon", equalTo(3))
                .body("metrics.result", equalTo("win"));
    }
}
