package com.stracks.core.activity;

import java.time.Instant;
import java.util.UUID;

import com.stracks.core.auth.AuthResourceTest;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

/**
 * #7: "all time" statistics for the profile. No calendar window covered them: the client
 * had to add up years, or settle for one.
 */
@QuarkusTest
class AllTimeStatsTest {

    @Test
    void period_all_sums_every_year_and_has_no_previous_period() {
        String token = AuthResourceTest.register("alltime-" + UUID.randomUUID() + "@example.com", "motdepasse8");
        PersonalRecordsTest.session(token, "running", Instant.parse("2023-05-10T08:00:00Z"), 10);
        PersonalRecordsTest.session(token, "running", Instant.parse("2024-05-10T08:00:00Z"), 10);
        PersonalRecordsTest.session(token, "walking", Instant.now().minusSeconds(3_600), 10);

        given().header("Authorization", "Bearer " + token)
                .queryParam("period", "all").queryParam("tz", "Europe/Paris")
                .when().get("/api/v1/stats/summary")
                .then().statusCode(200)
                .body("totalSessions", equalTo(3))
                .body("totalDurationS", equalTo(180))
                .body("previous.sessions", equalTo(0));

        // A calendar window, on the other hand, only sees the current year.
        given().header("Authorization", "Bearer " + token)
                .queryParam("period", "year").queryParam("tz", "Europe/Paris")
                .when().get("/api/v1/stats/summary")
                .then().statusCode(200)
                .body("totalSessions", equalTo(1));
    }

    @Test
    void the_chart_does_not_accept_period_all() {
        String token = AuthResourceTest.register("alltime-" + UUID.randomUUID() + "@example.com", "motdepasse8");
        given().header("Authorization", "Bearer " + token).queryParam("period", "all")
                .when().get("/api/v1/stats/timeline")
                .then().statusCode(400);
    }

    @Test
    void an_unknown_period_mentions_all_in_its_message() {
        String token = AuthResourceTest.register("alltime-" + UUID.randomUUID() + "@example.com", "motdepasse8");
        given().header("Authorization", "Bearer " + token).queryParam("period", "decade")
                .when().get("/api/v1/stats/summary")
                .then().statusCode(400)
                .body("detail", containsString("'all'"));
    }
}
