package com.stracks.core.user;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.stracks.core.auth.AuthResourceTest;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.response.ValidatableResponse;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

/** #37 : zones de confidentialité, stockées dans le document de préférences (aucune migration). */
@QuarkusTest
class PrivacyZonesPreferencesTest {

    private static String token() {
        return AuthResourceTest.register("zones-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    private static ValidatableResponse patch(String token, Object zones) {
        return given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body(Map.of("privacyZones", zones))
                .when().patch("/api/v1/users/me/preferences").then();
    }

    private static Map<String, Object> zone(double lat, double lng, int radiusM) {
        return Map.of("lat", lat, "lng", lng, "radiusM", radiusM, "label", "Domicile");
    }

    @Test
    void aucune_zone_par_defaut() {
        given().header("Authorization", "Bearer " + token())
                .when().get("/api/v1/users/me/preferences")
                .then().statusCode(200).body("privacyZones", empty());
    }

    @Test
    void une_liste_valide_est_stockee_et_remplace_la_precedente() {
        String token = token();
        patch(token, List.of(zone(48.85, 2.35, 300), zone(45.76, 4.83, 500))).statusCode(200)
                .body("privacyZones", hasSize(2));
        patch(token, List.of(zone(43.3, 5.37, 1000))).statusCode(200)
                .body("privacyZones", hasSize(1))
                .body("privacyZones[0].radiusM", equalTo(1000))
                .body("privacyZones[0].label", equalTo("Domicile"));
    }

    @Test
    void refuse_les_zones_invalides() {
        String token = token();
        patch(token, List.of(zone(48.85, 2.35, 50))).statusCode(422);      // rayon trop petit
        patch(token, List.of(zone(48.85, 2.35, 5000))).statusCode(422);    // rayon trop grand
        patch(token, List.of(zone(91, 2.35, 300))).statusCode(422);        // latitude hors plage
        patch(token, List.of(Map.of("lat", 48.85, "radiusM", 300))).statusCode(422); // lng manquante
        patch(token, List.of(Map.of("lat", 48.85, "lng", 2.35, "radiusM", 300, "adresse", "x")))
                .statusCode(422);                                          // clé inconnue
        patch(token, Map.of("lat", 48.85)).statusCode(422);               // pas une liste
        patch(token, List.of(zone(1, 1, 300), zone(2, 2, 300), zone(3, 3, 300),
                zone(4, 4, 300), zone(5, 5, 300), zone(6, 6, 300))).statusCode(422); // plus de 5
    }

    @Test
    void null_remet_la_liste_vide() {
        String token = token();
        patch(token, List.of(zone(48.85, 2.35, 300))).statusCode(200);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body("{\"privacyZones\": null}")
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200).body("privacyZones", empty());
    }
}
