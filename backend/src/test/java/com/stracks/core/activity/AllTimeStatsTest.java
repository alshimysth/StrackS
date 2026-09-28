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
 * #7 : statistiques « depuis toujours » pour le profil. Aucune fenêtre de calendrier ne
 * les couvrait — il fallait additionner des années côté client, ou se contenter d'une.
 */
@QuarkusTest
class AllTimeStatsTest {

    @Test
    void period_all_additionne_toutes_les_annees_et_n_a_pas_de_periode_precedente() {
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

        // Une fenêtre de calendrier ne voit, elle, que l'année en cours.
        given().header("Authorization", "Bearer " + token)
                .queryParam("period", "year").queryParam("tz", "Europe/Paris")
                .when().get("/api/v1/stats/summary")
                .then().statusCode(200)
                .body("totalSessions", equalTo(1));
    }

    @Test
    void le_graphique_n_accepte_pas_period_all() {
        String token = AuthResourceTest.register("alltime-" + UUID.randomUUID() + "@example.com", "motdepasse8");
        given().header("Authorization", "Bearer " + token).queryParam("period", "all")
                .when().get("/api/v1/stats/timeline")
                .then().statusCode(400);
    }

    @Test
    void une_periode_inconnue_mentionne_all_dans_son_message() {
        String token = AuthResourceTest.register("alltime-" + UUID.randomUUID() + "@example.com", "motdepasse8");
        given().header("Authorization", "Bearer " + token).queryParam("period", "decade")
                .when().get("/api/v1/stats/summary")
                .then().statusCode(400)
                .body("detail", containsString("'all'"));
    }
}
