package com.stracks.core.auth;

import java.util.Map;
import java.util.UUID;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

@QuarkusTest
public class AuthResourceTest {

    private static String uniqueEmail() {
        return "test-" + UUID.randomUUID() + "@example.com";
    }

    public static String register(String email, String password) {
        return given()
                .contentType("application/json")
                .body(Map.of("email", email, "password", password, "displayName", "Testeur"))
                .when().post("/api/v1/auth/register")
                .then().statusCode(201)
                .body("token", notNullValue())
                .body("user.email", equalTo(email.toLowerCase()))
                .extract().path("token");
    }

    @Test
    void register_then_login_and_me() {
        String email = uniqueEmail();
        register(email, "motdepasse8");

        String token = given()
                .contentType("application/json")
                .body(Map.of("email", email, "password", "motdepasse8"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(200)
                .body("token", notNullValue())
                .extract().path("token");

        given().header("Authorization", "Bearer " + token)
                .when().get("/api/v1/users/me")
                .then().statusCode(200)
                .body("email", equalTo(email))
                .body("displayName", equalTo("Testeur"));
    }

    @Test
    void register_duplicate_email_is_409_problem_json() {
        String email = uniqueEmail();
        register(email, "motdepasse8");

        given().contentType("application/json")
                .body(Map.of("email", email, "password", "motdepasse8"))
                .when().post("/api/v1/auth/register")
                .then().statusCode(409)
                .contentType("application/problem+json")
                .body("status", equalTo(409));
    }

    @Test
    void register_short_password_is_400() {
        given().contentType("application/json")
                .body(Map.of("email", uniqueEmail(), "password", "court"))
                .when().post("/api/v1/auth/register")
                .then().statusCode(400);
    }

    @Test
    void login_wrong_password_is_401() {
        String email = uniqueEmail();
        register(email, "motdepasse8");

        given().contentType("application/json")
                .body(Map.of("email", email, "password", "mauvaispass"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(401);
    }

    @Test
    void me_without_token_is_401() {
        given().when().get("/api/v1/users/me")
                .then().statusCode(401);
    }

    @Test
    void profile_update_and_delete_account() {
        String email = uniqueEmail();
        String token = register(email, "motdepasse8");

        given().header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .body(Map.of("displayName", "Coureur du dimanche"))
                .when().patch("/api/v1/users/me")
                .then().statusCode(200)
                .body("displayName", equalTo("Coureur du dimanche"));

        given().header("Authorization", "Bearer " + token)
                .when().delete("/api/v1/users/me")
                .then().statusCode(204);

        given().contentType("application/json")
                .body(Map.of("email", email, "password", "motdepasse8"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(401);
    }
}
