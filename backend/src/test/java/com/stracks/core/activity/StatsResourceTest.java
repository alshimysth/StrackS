package com.stracks.core.activity;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.stracks.core.auth.AuthResourceTest;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

/**
 * Statistics aggregates (#24): response shape, period windows, time bucketing and
 * respect of the plugin pattern.
 */
@QuarkusTest
class StatsResourceTest {

    private static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    private static String freshToken() {
        return AuthResourceTest.register("stats-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    /**
     * Creates a completed session starting at {@code start}, with a synthetic track
     * heading due north; the distance is recomputed by the server, never provided.
     */
    private static void completedActivity(String token, String sport, Instant start, int points) {
        String id = given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("sportType", sport, "startedAt", start.toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201)
                .extract().path("id");

        List<Map<String, Object>> track = new ArrayList<>();
        for (int i = 0; i < points; i++) {
            track.add(Map.of(
                    "seq", i,
                    "recordedAt", start.plusSeconds(i * 6L).toString(),
                    "lat", 45.0 + i * 0.0001,   // ≈ 11.1 m per step
                    "lng", 5.0,
                    "altitudeM", 200.0 + i * 0.2,
                    "accuracyM", 5.0));
        }
        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("points", track))
                .when().post("/api/v1/activities/" + id + "/track-points")
                .then().statusCode(201);

        Map<String, Object> stop = new HashMap<>();
        stop.put("endedAt", start.plusSeconds(points * 6L).toString());
        stop.put("durationS", points * 6);
        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(stop)
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200);
    }

    /** A safe instant in the current month: the 15th at noon, never straddling a boundary. */
    private static Instant middleOfThisMonth() {
        return ZonedDateTime.now(PARIS).withDayOfMonth(15).withHour(12)
                .truncatedTo(java.time.temporal.ChronoUnit.HOURS).toInstant();
    }

    // ------------------------------------------------------------------
    // Response shape: the core names no sport metric
    // ------------------------------------------------------------------

    @Test
    void sport_metrics_are_named_by_the_plugin_not_by_core() {
        String token = freshToken();
        completedActivity(token, "running", middleOfThisMonth(), 50);

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=month&tz=Europe/Paris")
                .then().statusCode(200)
                // Distance and elevation live under `totals`, named by the plugin...
                .body("totals", hasKey("distanceM"))
                .body("totals", hasKey("elevationGainM"))
                .body("bySport[0].totals", hasKey("distanceM"))
                // ...and not as core fields, which was the defect that got fixed.
                .body("totalDistanceM", nullValue())
                .body("totalElevationGainM", nullValue())
                .body("bySport[0].totalDistanceM", nullValue());
    }

    /**
     * DoD #24: "the displayed figures match the response exactly".
     * The totals aren't a second source of truth: they sum `bySport`.
     */
    @Test
    void totals_are_exactly_the_sum_of_the_per_sport_rows() {
        String token = freshToken();
        Instant base = middleOfThisMonth();
        completedActivity(token, "running", base, 50);
        completedActivity(token, "walking", base.plusSeconds(7200), 30);

        var body = given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=month&tz=Europe/Paris")
                .then().statusCode(200)
                .body("bySport", hasSize(2))
                .extract().jsonPath();

        int sessions = body.getInt("bySport.sessions.sum()");
        long duration = body.getLong("bySport.totalDurationS.sum()");
        double distance = body.getDouble("bySport.totals.distanceM.sum()");

        org.junit.jupiter.api.Assertions.assertEquals(sessions, body.getInt("totalSessions"));
        org.junit.jupiter.api.Assertions.assertEquals(duration, body.getLong("totalDurationS"));
        org.junit.jupiter.api.Assertions.assertEquals(
                distance, body.getDouble("totals.distanceM"), 0.05);
    }

    // ------------------------------------------------------------------
    // DoD #24: a sport with no session in the period
    // ------------------------------------------------------------------

    @Test
    void a_sport_with_no_session_in_the_period_yields_empty_aggregates_not_an_error() {
        String token = freshToken();
        completedActivity(token, "running", middleOfThisMonth(), 20);

        // Walking has no session: empty list, zero totals, no invented key.
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=month&sport=walking&tz=Europe/Paris")
                .then().statusCode(200)
                .body("bySport", empty())
                .body("totalSessions", equalTo(0))
                .body("totalDurationS", equalTo(0))
                .body("totals", equalTo(Map.of()))
                .body("previous.sessions", equalTo(0));
    }

    @Test
    void an_account_with_no_activity_at_all_still_returns_a_full_timeline() {
        String token = freshToken();

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/timeline?period=week&tz=Europe/Paris")
                .then().statusCode(200)
                .body("bucket", equalTo("day"))
                .body("buckets", hasSize(7))
                .body("buckets.bySport", everyItem(empty()));
    }

    // ------------------------------------------------------------------
    // Time bucketing
    // ------------------------------------------------------------------

    /**
     * An interval without sessions must exist, at zero. Without it, the chart squeezes its
     * bars and misrepresents the spacing of time.
     */
    @Test
    void empty_buckets_are_present_rather_than_omitted() {
        String token = freshToken();
        ZonedDateTime firstOfMonth = ZonedDateTime.now(PARIS).withDayOfMonth(1)
                .truncatedTo(java.time.temporal.ChronoUnit.DAYS);
        completedActivity(token, "running", firstOfMonth.plusHours(10).toInstant(), 20);

        var buckets = given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/timeline?period=month&tz=Europe/Paris")
                .then().statusCode(200)
                .body("bucket", equalTo("week"))
                .extract().jsonPath().getList("buckets");

        // The month spans 4 to 6 calendar weeks; only one holds the session.
        org.junit.jupiter.api.Assertions.assertTrue(buckets.size() >= 4,
                "month split into " + buckets.size() + " weeks");
        long nonEmpty = buckets.stream()
                .filter(b -> !((List<?>) ((Map<?, ?>) b).get("bySport")).isEmpty())
                .count();
        org.junit.jupiter.api.Assertions.assertEquals(1, nonEmpty,
                "only one week holds a session, the others exist at zero");
    }

    /**
     * Bucketing follows the user's calendar, not UTC: a Monday 00:30 run in Paris belongs
     * to that week, not the previous one.
     */
    @Test
    void buckets_follow_the_users_calendar_not_utc() {
        String token = freshToken();
        ZonedDateTime mondayEarly = ZonedDateTime.now(PARIS)
                .with(java.time.temporal.ChronoField.DAY_OF_WEEK, 1)
                .withHour(0).withMinute(30).truncatedTo(java.time.temporal.ChronoUnit.MINUTES);
        completedActivity(token, "running", mondayEarly.toInstant(), 20);

        // In Paris time, the session falls in the current week.
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=week&tz=Europe/Paris")
                .then().statusCode(200)
                .body("totalSessions", equalTo(1));

        // In UTC (00:30 Paris = 22:30 or 23:30 the day before), it falls in the previous one.
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=week")
                .then().statusCode(200)
                .body("totalSessions", equalTo(0))
                .body("previous.sessions", equalTo(1));
    }

    // ------------------------------------------------------------------
    // Comparison with the previous period
    // ------------------------------------------------------------------

    @Test
    void previous_window_is_the_same_period_shifted_not_a_running_total() {
        String token = freshToken();
        ZonedDateTime thisMonth = ZonedDateTime.now(PARIS).withDayOfMonth(15).withHour(12)
                .truncatedTo(java.time.temporal.ChronoUnit.HOURS);
        completedActivity(token, "running", thisMonth.toInstant(), 40);
        completedActivity(token, "running", thisMonth.minusMonths(1).toInstant(), 20);
        completedActivity(token, "running", thisMonth.minusMonths(2).toInstant(), 20);

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=month&tz=Europe/Paris")
                .then().statusCode(200)
                .body("totalSessions", equalTo(1))
                // The previous month alone, certainly not the two earlier months combined.
                .body("previous.sessions", equalTo(1))
                .body("previous.totals.distanceM", greaterThan(0f));
    }

    /**
     * `from` designates an instant WITHIN the wanted period, not its lower bound: that's
     * what lets the screen navigate month by month.
     */
    @Test
    void from_selects_the_whole_calendar_period_it_falls_in() {
        String token = freshToken();
        ZonedDateTime lastMonth = ZonedDateTime.now(PARIS).minusMonths(1)
                .withDayOfMonth(15).withHour(12).truncatedTo(java.time.temporal.ChronoUnit.HOURS);
        completedActivity(token, "running", lastMonth.withDayOfMonth(3).toInstant(), 20);
        completedActivity(token, "running", lastMonth.withDayOfMonth(27).toInstant(), 20);

        // A date in the middle of the month brings back the whole month, hence both
        // sessions, including the one on the 3rd, before `from`.
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=month&tz=Europe/Paris&from="
                        + lastMonth.toInstant())
                .then().statusCode(200)
                .body("totalSessions", equalTo(2));
    }

    // ------------------------------------------------------------------
    // Isolation and validation
    // ------------------------------------------------------------------

    @Test
    void another_users_sessions_are_never_counted() {
        String mine = freshToken();
        String theirs = freshToken();
        completedActivity(theirs, "running", middleOfThisMonth(), 30);

        given().header("Authorization", "Bearer " + mine)
                .when().get("/api/v1/stats/summary?period=month&tz=Europe/Paris")
                .then().statusCode(200)
                .body("totalSessions", equalTo(0));
    }

    @Test
    void invalid_period_and_timezone_are_rejected() {
        String token = freshToken();

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=decade")
                .then().statusCode(400);

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/timeline?period=week&tz=Mars/Olympus_Mons")
                .then().statusCode(400);

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=week&sport=quidditch")
                .then().statusCode(422);
    }

    @Test
    void stats_require_authentication() {
        given().when().get("/api/v1/stats/summary?period=week").then().statusCode(401);
        given().when().get("/api/v1/stats/timeline?period=week").then().statusCode(401);
    }

    /** The chart only plots core columns: it never opens the JSONB. */
    @Test
    void timeline_reports_core_columns_per_sport() {
        String token = freshToken();
        Instant base = middleOfThisMonth();
        completedActivity(token, "running", base, 50);
        completedActivity(token, "walking", base.plusSeconds(7200), 30);

        var week = given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/timeline?period=month&tz=Europe/Paris")
                .then().statusCode(200)
                .extract().jsonPath();

        List<Map<String, Object>> filled = new ArrayList<>();
        for (Object bucket : week.getList("buckets")) {
            List<Map<String, Object>> bySport =
                    (List<Map<String, Object>>) ((Map<?, ?>) bucket).get("bySport");
            filled.addAll(bySport);
        }
        org.junit.jupiter.api.Assertions.assertEquals(2, filled.size(),
                "both sports appear in the bucketing");
        org.junit.jupiter.api.Assertions.assertTrue(
                filled.stream().allMatch(v -> ((Number) v.get("distanceM")).doubleValue() > 0),
                "each value carries a distance recomputed by the server");
        org.junit.jupiter.api.Assertions.assertTrue(
                filled.stream().noneMatch(v -> v.containsKey("elevationGainM")),
                "the bucketing doesn't touch the metrics JSONB");
    }

    @Test
    void sport_filter_narrows_both_routes() {
        String token = freshToken();
        Instant base = middleOfThisMonth();
        completedActivity(token, "running", base, 50);
        completedActivity(token, "walking", base.plusSeconds(7200), 30);

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=month&sport=running&tz=Europe/Paris")
                .then().statusCode(200)
                .body("bySport", hasSize(1))
                .body("bySport[0].sportType", equalTo("running"))
                .body("totalSessions", equalTo(1));

        var buckets = given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/timeline?period=month&sport=running&tz=Europe/Paris")
                .then().statusCode(200)
                .extract().jsonPath().getList("buckets");

        org.junit.jupiter.api.Assertions.assertTrue(
                buckets.stream().flatMap(b -> ((List<Map<String, Object>>)
                        ((Map<?, ?>) b).get("bySport")).stream())
                        .allMatch(v -> "running".equals(v.get("sportType"))),
                "the sport filter also applies to the bucketing");
    }

    /** A session in progress isn't a session done: only `completed` ones count. */
    @Test
    void in_progress_sessions_are_excluded() {
        String token = freshToken();
        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("sportType", "running", "startedAt", middleOfThisMonth().toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201);

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/stats/summary?period=month&tz=Europe/Paris")
                .then().statusCode(200)
                .body("totalSessions", equalTo(0))
                .body("bySport", empty());
    }
}
