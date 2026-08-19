package com.stracks.core.activity;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.stracks.core.auth.AuthResourceTest;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

/**
 * Titre et notes d'activité (Story #25, migration V6).
 *
 * La DoD demande explicitement la vérification anti-IDOR sur l'édition : `PATCH` est le
 * premier verbe d'écriture exposé sur une ressource qu'un autre utilisateur pourrait
 * cibler par son identifiant.
 */
@QuarkusTest
class ActivityTitleTest {

    private static String freshToken() {
        return AuthResourceTest.register("title-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    private static String createActivity(String token) {
        return given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("sportType", "running", "startedAt", Instant.now().toString()))
                .when().post("/api/v1/activities")
                .then().statusCode(201)
                .extract().path("id");
    }

    /** `Map.of` refuse les valeurs nulles — indispensable pour tester l'effacement. */
    private static Map<String, Object> body(String key, Object value) {
        Map<String, Object> map = new HashMap<>();
        map.put(key, value);
        return map;
    }

    @Test
    void title_is_null_on_a_fresh_activity() {
        String token = freshToken();
        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/activities/" + createActivity(token))
                .then().statusCode(200)
                .body("title", nullValue());
    }

    @Test
    void title_is_persisted_and_returned() {
        String token = freshToken();
        String id = createActivity(token);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("title", "Sortie au lac"))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(200)
                .body("title", equalTo("Sortie au lac"));

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/activities/" + id)
                .then().statusCode(200)
                .body("title", equalTo("Sortie au lac"));
    }

    /**
     * Convention du PATCH : un champ absent n'est pas touché. Sans elle, éditer les
     * notes effacerait le titre au passage.
     */
    @Test
    void omitting_title_leaves_it_untouched() {
        String token = freshToken();
        String id = createActivity(token);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json").body(Map.of("title", "Fractionné"))
                .when().patch("/api/v1/activities/" + id).then().statusCode(200);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json").body(Map.of("notes", "Jambes lourdes"))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(200)
                .body("title", equalTo("Fractionné"))
                .body("notes", equalTo("Jambes lourdes"));
    }

    /** Chaîne vide = effacement explicite, seule façon de distinguer « vider » de « ne pas toucher ». */
    @Test
    void empty_string_clears_the_title() {
        String token = freshToken();
        String id = createActivity(token);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json").body(Map.of("title", "À effacer"))
                .when().patch("/api/v1/activities/" + id).then().statusCode(200);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json").body(Map.of("title", ""))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(200)
                .body("title", nullValue());
    }

    /** Un titre d'espaces n'est pas un titre : il serait « présent mais vide » à l'affichage. */
    @Test
    void blank_title_is_stored_as_null() {
        String token = freshToken();
        String id = createActivity(token);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json").body(Map.of("title", "   "))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(200)
                .body("title", nullValue());
    }

    @Test
    void title_is_trimmed() {
        String token = freshToken();
        String id = createActivity(token);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json").body(Map.of("title", "  Trail du soir  "))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(200)
                .body("title", equalTo("Trail du soir"));
    }

    @Test
    void title_longer_than_120_chars_is_rejected() {
        String token = freshToken();
        String id = createActivity(token);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("title", "x".repeat(121)))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(400);
    }

    @Test
    void title_of_exactly_120_chars_is_accepted() {
        String token = freshToken();
        String id = createActivity(token);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("title", "x".repeat(120)))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(200);
    }

    @Test
    void null_title_is_accepted_and_changes_nothing() {
        String token = freshToken();
        String id = createActivity(token);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json").body(body("title", null))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(200)
                .body("title", nullValue());
    }

    /** DoD #25 : impossible d'éditer l'activité d'un autre — et son existence n'est pas révélée. */
    @Test
    void another_user_cannot_edit_the_activity() {
        String owner = freshToken();
        String id = createActivity(owner);
        String intruder = freshToken();

        given().header("Authorization", "Bearer " + intruder)
                .contentType("application/json")
                .body(Map.of("title", "Volé"))
                .when().patch("/api/v1/activities/" + id)
                .then().statusCode(404);

        given().header("Authorization", "Bearer " + owner)
                .when().get("/api/v1/activities/" + id)
                .then().statusCode(200)
                .body("title", nullValue());
    }

    @Test
    void title_is_exposed_in_the_history_listing() {
        String token = freshToken();
        String id = createActivity(token);

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json").body(Map.of("title", "Boucle du parc"))
                .when().patch("/api/v1/activities/" + id).then().statusCode(200);

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/activities?page=0&size=20")
                .then().statusCode(200)
                .body("items.find { it.id == '" + id + "' }.title", equalTo("Boucle du parc"));
    }
}
