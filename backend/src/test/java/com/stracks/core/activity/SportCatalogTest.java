package com.stracks.core.activity;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.stracks.core.activity.application.SportRegistry;
import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;
import com.stracks.core.auth.AuthResourceTest;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.path.json.JsonPath;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItems;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The catalogue as the client sees it. Fourteen sports in five families, each with a
 * tracking mode: this is what the sport picker, the history filters and the mobile
 * registry parity test are built on.
 */
@QuarkusTest
class SportCatalogTest {

    static final Map<String, Set<String>> EXPECTED_FAMILIES = Map.of(
            "running", Set.of("running", "trail_running", "treadmill_running"),
            "walking", Set.of("walking"),
            "cycling", Set.of("cycling", "mountain_biking", "indoor_cycling"),
            "climbing", Set.of("bouldering", "rope_climbing"),
            "racket", Set.of("tennis", "padel", "badminton", "squash", "table_tennis"));

    static final Set<String> TIMER_SPORTS = Set.of(
            "treadmill_running", "indoor_cycling", "bouldering", "rope_climbing",
            "tennis", "padel", "badminton", "squash", "table_tennis");

    @Inject
    SportRegistry registry;

    private static String freshToken() {
        return AuthResourceTest.register("catalog-" + UUID.randomUUID() + "@example.com", "motdepasse8");
    }

    @Test
    void every_expected_sport_is_registered_with_its_family_and_mode() {
        List<SportTypeDescriptor> descriptors = registry.descriptors();
        int expectedCount = EXPECTED_FAMILIES.values().stream().mapToInt(Set::size).sum();
        assertEquals(expectedCount, descriptors.size(), descriptors.toString());

        for (SportTypeDescriptor d : descriptors) {
            Set<String> family = EXPECTED_FAMILIES.get(d.family().code());
            assertTrue(family != null && family.contains(d.code()), d.code() + " in family " + d.family());
            TrackingMode expectedMode = TIMER_SPORTS.contains(d.code()) ? TrackingMode.TIMER : TrackingMode.GPS;
            assertEquals(expectedMode, d.trackingMode(), d.code());
            assertEquals(expectedMode == TrackingMode.GPS, d.usesGps(), d.code());
            assertTrue(d.schemaVersion() >= 1, d.code());
        }
    }

    @Test
    void descriptors_are_grouped_by_family_for_the_picker() {
        List<SportTypeDescriptor> descriptors = registry.descriptors();
        for (int i = 1; i < descriptors.size(); i++) {
            String previous = descriptors.get(i - 1).family().code();
            String current = descriptors.get(i).family().code();
            assertTrue(previous.compareTo(current) <= 0, previous + " before " + current);
        }
    }

    @Test
    void the_api_exposes_family_tracking_mode_and_the_legacy_uses_gps_flag() {
        JsonPath json = given().header("Authorization", "Bearer " + freshToken())
                .when().get("/api/v1/sport-types")
                .then().statusCode(200)
                .body("code", hasItems("running", "trail_running", "cycling", "bouldering", "tennis"))
                .body("find { it.code == 'bouldering' }.trackingMode", equalTo("TIMER"))
                .body("find { it.code == 'bouldering' }.usesGps", equalTo(false))
                .body("find { it.code == 'bouldering' }.family.code", equalTo("climbing"))
                .body("find { it.code == 'bouldering' }.family.label", equalTo("Escalade"))
                .body("find { it.code == 'trail_running' }.usesGps", equalTo(true))
                .body("find { it.code == 'trail_running' }.family.code", equalTo("running"))
                .extract().jsonPath();
        assertEquals(14, json.getList("code").size());
    }

    @Test
    void an_unknown_sport_is_still_refused_at_start() {
        given().header("Authorization", "Bearer " + freshToken())
                .contentType("application/json")
                .body(Map.of("sportType", "quidditch", "startedAt", "2026-11-12T08:00:00Z"))
                .when().post("/api/v1/activities")
                .then().statusCode(422);
    }
}
