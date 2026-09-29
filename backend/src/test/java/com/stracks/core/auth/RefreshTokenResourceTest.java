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
 * Session refresh (story #44): issuing, rotation, revocation, and above all the guarantee
 * that motivates the ticket: the JWT expiring mid-session must not cost a single track
 * point.
 *
 * <p>Replay detection outside the grace window is covered separately by
 * {@link RefreshTokenReuseTest}, which brings the window down to zero.
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
    void login_also_issues_a_refresh_token() {
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
    void refresh_returns_a_usable_access_token_and_rotates_the_token() {
        Session session = register();

        JsonPath renewed = refresh(session.refreshToken(), 200);
        String newAccess = renewed.getString("token");
        String rotated = renewed.getString("refreshToken");

        // Rotation: the presented token is consumed, another one replaces it.
        assertNotEquals(session.refreshToken(), rotated);
        // The returned JWT does open the protected resources, on the right account.
        assertTokenBelongsTo(newAccess, session.email());
        assertEquals(session.email(), renewed.getString("user.email"));
    }

    @Test
    void refresh_chains_over_several_rotations() {
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
    void refresh_with_an_unknown_token_is_401_problem_json() {
        given().contentType("application/json")
                .body(Map.of("refreshToken", "jeton-qui-n-existe-pas"))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(401)
                .contentType("application/problem+json")
                .body("status", equalTo(401))
                .body("title", notNullValue());
    }

    @Test
    void refresh_without_token_is_400() {
        given().contentType("application/json")
                .body(Map.of("refreshToken", ""))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(400);
    }

    @Test
    void logout_revokes_the_session_server_side() {
        Session session = register();

        given().contentType("application/json")
                .body(Map.of("refreshToken", session.refreshToken()))
                .when().post("/api/v1/auth/logout")
                .then().statusCode(204);

        refresh(session.refreshToken(), 401);
    }

    @Test
    void logout_revokes_the_whole_family_not_just_the_last_token() {
        Session session = register();
        String rotated = refresh(session.refreshToken(), 200).getString("refreshToken");

        // Logout presented with the current token...
        given().contentType("application/json")
                .body(Map.of("refreshToken", rotated))
                .when().post("/api/v1/auth/logout")
                .then().statusCode(204);

        // ...no token of the family survives, neither the current one nor its predecessor.
        refresh(rotated, 401);
        refresh(session.refreshToken(), 401);
    }

    @Test
    void logout_is_idempotent_and_silent_on_an_unknown_token() {
        // Answering "known / unknown" would turn the endpoint into a validity oracle.
        given().contentType("application/json")
                .body(Map.of("refreshToken", "jeton-qui-n-existe-pas"))
                .when().post("/api/v1/auth/logout")
                .then().statusCode(204);
    }

    @Test
    void refresh_ignores_the_bearer_and_serves_the_token_owner() {
        Session alice = register();
        Session bob = register();

        // Alice presents her own Bearer with Bob's refresh token.
        // The identity served must come from the token's row, never from the request.
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
    void refresh_after_account_deletion_is_401() {
        Session session = register();

        given().header("Authorization", "Bearer " + session.token())
                .when().delete("/api/v1/users/me")
                .then().statusCode(204);

        refresh(session.refreshToken(), 401);
    }

    @Test
    void immediate_replay_within_the_grace_window_does_not_log_out() {
        // Common case on the move: the rotation response gets lost, the client retries
        // with the token it still has. Treating it as theft would kick the user out
        // mid-session, exactly what #44 must prevent.
        Session session = register();
        String rotated = refresh(session.refreshToken(), 200).getString("refreshToken");

        String recovered = refresh(session.refreshToken(), 200).getString("refreshToken");
        assertNotEquals(rotated, recovered);
        assertTokenBelongsTo(refresh(recovered, 200).getString("token"), session.email());
    }

    @Test
    void refresh_during_an_active_session_loses_no_point() {
        Session session = register();
        Instant start = Instant.now().minusSeconds(600);

        String activityId = given().header("Authorization", "Bearer " + session.token())
                .contentType("application/json")
                .body(Map.of("sportType", "running", "startedAt", start.toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201)
                .extract().path("id");

        // First batch sent with the original token.
        given().header("Authorization", "Bearer " + session.token())
                .contentType("application/json")
                .body(Map.of("points", track(start, 0)))
                .when().post("/api/v1/activities/" + activityId + "/track-points")
                .then().statusCode(201)
                .body("inserted", equalTo(25));

        // The JWT expires here: the client refreshes silently, session still open.
        JsonPath renewed = refresh(session.refreshToken(), 200);
        String newAccess = renewed.getString("token");

        // Second batch with the new token: that's the replay the mobile uploader does.
        given().header("Authorization", "Bearer " + newAccess)
                .contentType("application/json")
                .body(Map.of("points", track(start, 25)))
                .when().post("/api/v1/activities/" + activityId + "/track-points")
                .then().statusCode(201)
                .body("inserted", equalTo(25));

        // The session ends normally and does carry the 50 points of both batches.
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

    /** Synthetic 25-point track, aligned with the one in ActivityFlowTest. */
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
