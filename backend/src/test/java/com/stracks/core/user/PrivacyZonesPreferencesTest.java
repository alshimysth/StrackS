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

/** #37: privacy zones, stored in the preferences document (no migration). */
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
    void no_zone_by_default() {
        given().header("Authorization", "Bearer " + token())
                .when().get("/api/v1/users/me/preferences")
                .then().statusCode(200).body("privacyZones", empty());
    }

    @Test
    void a_valid_list_is_stored_and_replaces_the_previous_one() {
        String token = token();
        patch(token, List.of(zone(48.85, 2.35, 300), zone(45.76, 4.83, 500))).statusCode(200)
                .body("privacyZones", hasSize(2));
        patch(token, List.of(zone(43.3, 5.37, 1000))).statusCode(200)
                .body("privacyZones", hasSize(1))
                .body("privacyZones[0].radiusM", equalTo(1000))
                .body("privacyZones[0].label", equalTo("Domicile"));
    }

    @Test
    void rejects_invalid_zones() {
        String token = token();
        patch(token, List.of(zone(48.85, 2.35, 50))).statusCode(422);      // rayon trop petit
        patch(token, List.of(zone(48.85, 2.35, 5000))).statusCode(422);    // rayon trop grand
        patch(token, List.of(zone(91, 2.35, 300))).statusCode(422);        // latitude hors plage
        patch(token, List.of(Map.of("lat", 48.85, "radiusM", 300))).statusCode(422); // missing lng
        patch(token, List.of(Map.of("lat", 48.85, "lng", 2.35, "radiusM", 300, "adresse", "x")))
                .statusCode(422);                                          // unknown key
        patch(token, Map.of("lat", 48.85)).statusCode(422);               // not a list
        patch(token, List.of(zone(1, 1, 300), zone(2, 2, 300), zone(3, 3, 300),
                zone(4, 4, 300), zone(5, 5, 300), zone(6, 6, 300))).statusCode(422); // more than 5
    }

    @Test
    void null_resets_to_an_empty_list() {
        String token = token();
        patch(token, List.of(zone(48.85, 2.35, 300))).statusCode(200);
        given().header("Authorization", "Bearer " + token).contentType("application/json")
                .body("{\"privacyZones\": null}")
                .when().patch("/api/v1/users/me/preferences")
                .then().statusCode(200).body("privacyZones", empty());
    }
}
