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
 * Records personnels (#61) : exacts quel que soit le nombre de séances, calculés sur des
 * valeurs recalculées par le serveur, jamais sur des données partielles.
 */
@QuarkusTest
class PersonalRecordsTest {

    private static String freshToken() {
        return AuthResourceTest.register("records-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    /**
     * Séance terminée de {@code points} points plein nord (≈ 11,1 m par pas, 6 s par pas) :
     * distance et durée croissent avec {@code points}. La distance est recalculée par le
     * serveur au stop, jamais fournie.
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
     * Le cas qui motivait le ticket : le record est détenu par une séance ancienne, bien
     * au-delà de la première page d'historique (20 séances). Une lecture partielle se
     * tromperait ; le serveur, non.
     */
    @Test
    void le_record_est_exact_au_dela_de_la_premiere_page_d_historique() {
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

    /** Égaler son record ne le bat pas : la séance du jour ne devient pas détentrice. */
    @Test
    void egaler_un_record_ne_le_bat_pas_et_le_depasser_si() {
        String token = freshToken();
        Instant t0 = Instant.parse("2025-03-01T08:00:00Z");
        String first = session(token, "running", t0, 30);
        session(token, "running", t0.plusSeconds(86_400), 30);

        assertEquals(first, record(records(token, "running"), "running", "distanceM").get("activityId"));

        String better = session(token, "running", t0.plusSeconds(2 * 86_400), 31);
        assertEquals(better, record(records(token, "running"), "running", "distanceM").get("activityId"));
    }

    /**
     * Même `startedAt`, même distance : la première séance enregistrée garde le record,
     * quel que soit l'ordre de ses UUID. Répété pour que le hasard des UUID ne puisse pas
     * faire passer le test par chance.
     */
    @Test
    void a_depart_identique_la_premiere_seance_enregistree_reste_detentrice() {
        for (int attempt = 0; attempt < 5; attempt++) {
            String token = freshToken();
            Instant same = Instant.parse("2025-04-01T08:00:00Z");
            String first = session(token, "running", same, 30);
            session(token, "running", same, 30);
            assertEquals(first, record(records(token, "running"), "running", "distanceM").get("activityId"));
        }
    }

    @Test
    void les_records_sont_tenus_par_sport_et_ne_melangent_pas_les_comptes() {
        String token = freshToken();
        String other = freshToken();
        Instant t0 = Instant.parse("2025-06-01T08:00:00Z");
        String run = session(token, "running", t0, 20);
        String walk = session(token, "walking", t0.plusSeconds(3_600), 25);
        session(other, "running", t0, 200); // record d'un autre compte : invisible ici

        JsonPath json = records(token, null);
        assertEquals(run, record(json, "running", "distanceM").get("activityId"));
        assertEquals(walk, record(json, "walking", "distanceM").get("activityId"));

        JsonPath onlyWalking = records(token, "walking");
        assertEquals(1, onlyWalking.getList("bySport").size());
        assertNull(record(onlyWalking, "running", "distanceM"));
    }

    @Test
    void un_compte_sans_seance_n_a_aucun_record() {
        assertTrue(records(freshToken(), null).getList("bySport").isEmpty());
    }

    @Test
    void un_sport_inconnu_est_refuse() {
        given().header("Authorization", "Bearer " + freshToken()).queryParam("sport", "curling")
                .when().get("/api/v1/stats/records").then().statusCode(422);
    }
}
