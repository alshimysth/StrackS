package com.stracks.core.auth;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.path.json.JsonPath;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

/**
 * #49: a session lasting longer than the access JWT, **actually expired**.
 *
 * <p>The #44 test refreshed a still-valid token. Here, the lifetime is brought down to 2 s
 * (plus 1 s of clock tolerance) and the test really waits for it to elapse: the server
 * rejects the old token (401), the refresh issues a new one, and the track upload resumes.
 * Three cycles replay, sped up, a 45 min session with a 15 min lifetime, without losing a
 * single point.
 */
@QuarkusTest
@TestProfile(ShortLivedAccessTokenTest.TwoSecondsProfile.class)
class ShortLivedAccessTokenTest {

    public static class TwoSecondsProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            // SmallRye tolerates 60 s of clock skew by default, and a value of 0 is read as
            // "not set": hence lot D's failure with `clock.skew=0`, worked around back then by
            // waiting over a minute. 1 s is the smallest effective tolerance.
            return Map.of("stracks.jwt.ttl-seconds", "2",
                    "mp.jwt.verify.clock.skew", "1",
                    "smallrye.jwt.expiration.grace", "1");
        }
    }

    @Test
    void a_session_longer_than_the_jwt_loses_no_point() throws Exception {
        JsonPath session = given().contentType("application/json")
                .body(Map.of("email", "short-" + UUID.randomUUID() + "@example.com",
                        "password", "motdepasse8"))
                .when().post("/api/v1/auth/register")
                .then().statusCode(201)
                .extract().jsonPath();
        String access = session.getString("token");
        String refresh = session.getString("refreshToken");
        Instant start = Instant.now().minusSeconds(3600);

        String activityId = given().header("Authorization", "Bearer " + access)
                .contentType("application/json")
                .body(Map.of("sportType", "running", "startedAt", start.toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201)
                .extract().path("id");

        for (int round = 0; round < 3; round++) {
            Thread.sleep(3_500); // 2 s of life + 1 s of tolerance: the JWT is expired, for real

            given().header("Authorization", "Bearer " + access)
                    .contentType("application/json")
                    .body(Map.of("points", track(start, round * 25)))
                    .when().post("/api/v1/activities/" + activityId + "/track-points")
                    .then().statusCode(401);

            JsonPath renewed = given().contentType("application/json")
                    .body(Map.of("refreshToken", refresh))
                    .when().post("/api/v1/auth/refresh")
                    .then().statusCode(200)
                    .extract().jsonPath();
            access = renewed.getString("token");
            refresh = renewed.getString("refreshToken");

            // Replay of the same batch, as the mobile client does after a 401.
            given().header("Authorization", "Bearer " + access)
                    .contentType("application/json")
                    .body(Map.of("points", track(start, round * 25)))
                    .when().post("/api/v1/activities/" + activityId + "/track-points")
                    .then().statusCode(201)
                    .body("inserted", equalTo(25));
        }

        given().header("Authorization", "Bearer " + access)
                .when().get("/api/v1/activities/" + activityId + "/track-points")
                .then().statusCode(200)
                .body("size()", equalTo(75));
    }

    private static List<Map<String, Object>> track(Instant start, int offsetSeq) {
        List<Map<String, Object>> points = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            int seq = offsetSeq + i;
            points.add(Map.of(
                    "seq", seq,
                    "recordedAt", start.plusSeconds(seq * 6L).toString(),
                    "lat", 45.0 + seq * 0.0001,
                    "lng", 5.0,
                    "altitudeM", 200.0,
                    "accuracyM", 5.0));
        }
        return points;
    }
}
