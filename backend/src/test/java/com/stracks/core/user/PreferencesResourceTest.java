package com.stracks.core.user;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.auth.AuthResourceTest;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * User preferences: defaults, partial merge, validation, anti-IDOR, and the effect of the
 * athlete profile on the calorie estimate.
 */
@QuarkusTest
class PreferencesResourceTest {

    @Inject
    PreferencesService preferences;

    private static String freshToken() {
        return AuthResourceTest.register("prefs-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    private static io.restassured.specification.RequestSpecification as(String token) {
        return given().header("Authorization", "Bearer " + token).contentType("application/json");
    }

    @Test
    void fresh_account_gets_coherent_defaults() {
        as(freshToken())
                .when().get("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("units", equalTo("metric"))
                .body("theme", equalTo("auto"))
                .body("gpsMode", equalTo("balanced"))
                .body("countdownEnabled", equalTo(true))
                // Outside PRD v2.0 until the product decision is made (#20)
                .body("autoPauseEnabled", equalTo(false))
                .body("defaultSport", nullValue())
                .body("physical.weightKg", nullValue())
                .body("weeklyGoal.distanceM", nullValue());
    }

    /**
     * SPARSE merge of `sportDisplay` (#66, review).
     *
     * The mobile app only sends the changed entry, never the rebuilt table: the chips stay
     * actionable while a save is in flight, and starting from a local snapshot would bring
     * back another sport's previous choice. This server behaviour is therefore now a
     * contract, not an implementation detail.
     */
    @Test
    void sparse_sport_display_patch_preserves_other_sports() {
        String token = freshToken();

        as(token).body(Map.of("sportDisplay", Map.of("running", "pace")))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("sportDisplay.running", equalTo("pace"));

        // A patch carrying ONLY walking must not erase running.
        as(token).body(Map.of("sportDisplay", Map.of("walking", "speed")))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("sportDisplay.running", equalTo("pace"))
                .body("sportDisplay.walking", equalTo("speed"));

        as(token).when().get("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("sportDisplay.running", equalTo("pace"))
                .body("sportDisplay.walking", equalTo("speed"));
    }

    @Test
    void sparse_sport_display_patch_overwrites_the_same_sport() {
        String token = freshToken();

        as(token).body(Map.of("sportDisplay", Map.of("running", "pace")))
                .when().patch("/api/v1/users/me/preferences").then().statusCode(200);

        as(token).body(Map.of("sportDisplay", Map.of("running", "speed")))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("sportDisplay.running", equalTo("speed"));
    }

    @Test
    void patch_is_partial_and_persisted() {
        String token = freshToken();

        as(token).body(Map.of("units", "imperial", "theme", "dark"))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("units", equalTo("imperial"))
                .body("theme", equalTo("dark"))
                .body("gpsMode", equalTo("balanced")); // untouched

        // A second patch must not erase the first one
        as(token).body(Map.of("gpsMode", "saver"))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("units", equalTo("imperial"))
                .body("gpsMode", equalTo("saver"));

        as(token).when().get("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("units", equalTo("imperial"))
                .body("theme", equalTo("dark"))
                .body("gpsMode", equalTo("saver"));
    }

    @Test
    void nested_patch_merges_without_clobbering_siblings() {
        String token = freshToken();

        as(token).body(Map.of("physical", Map.of("weightKg", 72.5, "heightCm", 178)))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200);

        // Touching only the weight must not erase the height
        as(token).body(Map.of("physical", Map.of("weightKg", 74)))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("physical.weightKg", equalTo(74))
                .body("physical.heightCm", equalTo(178));
    }

    @Test
    void null_resets_a_preference_to_its_default() {
        String token = freshToken();

        as(token).body(Map.of("units", "imperial"))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200).body("units", equalTo("imperial"));

        Map<String, Object> reset = new HashMap<>();
        reset.put("units", null);
        as(token).body(reset)
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("units", equalTo("metric"));
    }

    @Test
    void unknown_key_is_rejected_rather_than_silently_stored() {
        as(freshToken()).body(Map.of("unitz", "metric"))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(422)
                .body("title", equalTo("Préférence invalide"));
    }

    @Test
    void invalid_values_are_rejected() {
        String token = freshToken();

        as(token).body(Map.of("theme", "neon"))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(422);

        as(token).body(Map.of("countdownEnabled", "oui"))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(422);

        // Weight in pounds entered as kilos: outside the plausibility bounds
        as(token).body(Map.of("physical", Map.of("weightKg", 400)))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(422);

        as(token).body(Map.of("physical", Map.of("birthDate", "hier")))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(422);

        as(token).body(Map.of("physical", Map.of("poids", 70)))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(422);
    }

    @Test
    void default_sport_must_exist_in_the_registry() {
        String token = freshToken();

        as(token).body(Map.of("defaultSport", "running"))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("defaultSport", equalTo("running"));

        as(token).body(Map.of("defaultSport", "quidditch"))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(422)
                .body("title", equalTo("Sport inconnu"));
    }

    @Test
    void preferences_are_scoped_to_their_owner() {
        String alice = freshToken();
        String bob = freshToken();

        as(alice).body(Map.of("theme", "dark"))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200);

        as(bob).when().get("/api/v1/users/me/preferences")
                .then().statusCode(200)
                .body("theme", equalTo("auto")); // Bob keeps his defaults

        given().when().get("/api/v1/users/me/preferences").then().statusCode(401);
    }

    // ── Calories (#33) ───────────────────────────────────────────────────────

    private static List<Map<String, Object>> track(Instant start) {
        List<Map<String, Object>> points = new ArrayList<>();
        for (int i = 0; i < 60; i++) {
            points.add(Map.of(
                    "seq", i,
                    "recordedAt", start.plusSeconds(i * 10L).toString(),
                    "lat", 45.0 + i * 0.0003,
                    "lng", 5.0,
                    "altitudeM", 200.0,
                    "accuracyM", 5.0));
        }
        return points;
    }

    private static String completeRun(String token, Instant start) {
        String id = as(token).body(Map.of("sportType", "running", "startedAt", start.toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201).extract().path("id");

        as(token).body(Map.of("points", track(start)))
                .when().post("/api/v1/activities/" + id + "/track-points")
                .then().statusCode(201);

        as(token).body(Map.of("endedAt", start.plusSeconds(600).toString(), "durationS", 600))
                .when().post("/api/v1/activities/" + id + "/stop")
                .then().statusCode(200);
        return id;
    }

    @Test
    void calories_are_estimated_only_when_weight_is_known() {
        Instant start = Instant.now().minusSeconds(1200);

        // Without weight: no made-up value
        String noWeight = freshToken();
        String plain = completeRun(noWeight, start);
        as(noWeight).when().get("/api/v1/activities/" + plain)
                .then().statusCode(200)
                .body("calories", nullValue());

        // With weight: plausible estimate
        String withWeight = freshToken();
        as(withWeight).body(Map.of("physical", Map.of("weightKg", 70)))
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200);

        String measured = completeRun(withWeight, start);
        Integer kcal = as(withWeight).when().get("/api/v1/activities/" + measured)
                .then().statusCode(200)
                .body("calories", notNullValue())
                .extract().path("calories");

        // 10 min of running at 70 kg: a few dozen up to ~200 kcal
        assertTrue(kcal > 20 && kcal < 400, "implausible estimate: " + kcal + " kcal");
    }

    /**
     * Tolerant read: the core never destroys a key it doesn't understand, since a more
     * recent client may have written a preference this backend ignores. Checked at the
     * service level, as the API deliberately refuses to write an unknown one (accepted
     * read/write asymmetry).
     */
    @Test
    void unknown_stored_preferences_survive_a_patch() {
        ObjectNode stored = JsonNodeFactory.instance.objectNode();
        stored.put("futurePreference", "valeur d'un client plus récent");
        stored.put("units", "imperial");

        ObjectNode patch = JsonNodeFactory.instance.objectNode();
        patch.put("theme", "dark");

        ObjectNode merged = preferences.merge(stored, patch);
        assertEquals("valeur d'un client plus récent", merged.get("futurePreference").asText());
        assertEquals("imperial", merged.get("units").asText());
        assertEquals("dark", merged.get("theme").asText());

        ObjectNode full = preferences.withDefaults(merged);
        assertEquals("valeur d'un client plus récent", full.get("futurePreference").asText());
        assertEquals("balanced", full.get("gpsMode").asText()); // default applied on the way
    }
}
