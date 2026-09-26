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
 * #49 : une séance qui dure plus longtemps que le JWT d'accès, **réellement expiré**.
 *
 * <p>Le test de #44 renouvelait un jeton encore valide. Ici, la durée de vie est ramenée à
 * 2 s (plus 1 s de tolérance d'horloge) et le test attend vraiment qu'elle s'écoule : le serveur refuse l'ancien jeton (401),
 * le renouvellement en délivre un neuf, et l'envoi du tracé reprend. Trois cycles
 * reproduisent en accéléré une séance de 45 min à 15 min de durée de vie — sans perte d'un
 * seul point.
 */
@QuarkusTest
@TestProfile(ShortLivedAccessTokenTest.TwoSecondsProfile.class)
class ShortLivedAccessTokenTest {

    public static class TwoSecondsProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            // SmallRye tolère 60 s de dérive d'horloge par défaut, et une valeur de 0 est
            // lue comme « non réglé » — d'où l'échec du lot D avec `clock.skew=0`, contourné
            // alors en attendant plus d'une minute. 1 s est la plus petite tolérance effective.
            return Map.of("stracks.jwt.ttl-seconds", "2",
                    "mp.jwt.verify.clock.skew", "1",
                    "smallrye.jwt.expiration.grace", "1");
        }
    }

    @Test
    void une_seance_plus_longue_que_le_jwt_ne_perd_aucun_point() throws Exception {
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
            Thread.sleep(3_500); // 2 s de vie + 1 s de tolérance : le JWT est expiré, pour de vrai

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

            // Le rejeu du même lot, comme le fait le client mobile après un 401.
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
