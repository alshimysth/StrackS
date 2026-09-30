package com.stracks.core.auth;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.stracks.core.mail.CapturingEmailSender;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.path.json.JsonPath;
import io.restassured.response.ValidatableResponse;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Lifecycle of the account's secrets: #73 password, #74 forgotten password, #75 email. */
@QuarkusTest
class AccountFlowTest {

    @Inject
    CapturingEmailSender mailbox;

    record Account(String email, String token, String refreshToken) {
    }

    static Account register() {
        String email = "acct-" + UUID.randomUUID() + "@example.com";
        JsonPath body = given().contentType("application/json")
                .body(Map.of("email", email, "password", "motdepasse8"))
                .when().post("/api/v1/auth/register")
                .then().statusCode(201).extract().jsonPath();
        return new Account(email, body.getString("token"), body.getString("refreshToken"));
    }

    static ValidatableResponse login(String email, String password) {
        return given().contentType("application/json")
                .body(Map.of("email", email, "password", password))
                .when().post("/api/v1/auth/login").then();
    }

    static ValidatableResponse refresh(String refreshToken) {
        return given().contentType("application/json").body(Map.of("refreshToken", refreshToken))
                .when().post("/api/v1/auth/refresh").then();
    }

    static ValidatableResponse post(Account account, String path, Object body) {
        var request = given().header("Authorization", "Bearer " + account.token());
        if (body != null) {
            request = request.contentType("application/json").body(body);
        }
        return request.when().post("/api/v1/users/me" + path).then();
    }

    String codeFor(String address) {
        return mailbox.lastCodeFor(address).orElseThrow(() -> new AssertionError("no code received by " + address));
    }

    @Nested
    class PasswordChange {

        /** 403 and not 401: the mobile client would take a 401 for an expired session. */
        @Test
        void a_wrong_current_password_answers_403() {
            Account a = register();
            post(a, "/password", Map.of("currentPassword", "faux-mdp-1", "newPassword", "nouveau-mdp"))
                    .statusCode(403);
            login(a.email(), "motdepasse8").statusCode(200);
        }

        @Test
        void changes_the_password_and_cuts_the_other_sessions() {
            Account a = register();
            String otherDevice = login(a.email(), "motdepasse8").statusCode(200)
                    .extract().path("refreshToken");

            JsonPath renewed = post(a, "/password",
                    Map.of("currentPassword", "motdepasse8", "newPassword", "nouveau-mdp"))
                    .statusCode(200)
                    .body("token", notNullValue())
                    .body("refreshToken", notNullValue())
                    .extract().jsonPath();

            refresh(a.refreshToken()).statusCode(401);
            refresh(otherDevice).statusCode(401);
            refresh(renewed.getString("refreshToken")).statusCode(200); // the current device stays logged in

            login(a.email(), "motdepasse8").statusCode(401);
            login(a.email(), "nouveau-mdp").statusCode(200);
            assertFalse(mailbox.sentTo(a.email()).stream()
                    .filter(m -> m.subject().contains("modifié")).toList().isEmpty(), "alert sent");
        }

        @Test
        void rejects_a_new_password_that_is_too_short() {
            Account a = register();
            post(a, "/password", Map.of("currentPassword", "motdepasse8", "newPassword", "court"))
                    .statusCode(400);
        }
    }

    @Nested
    class ForgottenPassword {

        static ValidatableResponse requestReset(String email) {
            return given().contentType("application/json").body(Map.of("email", email))
                    .when().post("/api/v1/auth/password-resets").then();
        }

        static ValidatableResponse confirm(String email, String code, String newPassword) {
            return given().contentType("application/json")
                    .body(Map.of("email", email, "code", code, "newPassword", newPassword))
                    .when().post("/api/v1/auth/password-reset-confirmations").then();
        }

        @Test
        void an_address_without_account_gets_the_same_response_and_no_email() {
            String ghost = "absent-" + UUID.randomUUID() + "@example.com";
            requestReset(ghost).statusCode(202);
            assertTrue(mailbox.sentTo(ghost).isEmpty());
        }

        @Test
        void the_received_code_lets_the_user_choose_a_new_password_and_cuts_the_sessions() {
            Account a = register();
            requestReset(a.email()).statusCode(202);
            String code = codeFor(a.email());

            // Copied in lowercase and without the dash: tolerated.
            confirm(a.email(), code.toLowerCase().replace("-", ""), "reinitialise-1").statusCode(204);

            refresh(a.refreshToken()).statusCode(401);
            login(a.email(), "motdepasse8").statusCode(401);
            login(a.email(), "reinitialise-1").statusCode(200)
                    .body("user.emailVerified", equalTo(true)); // the code proved control of the address
        }

        @Test
        void a_code_can_only_be_used_once() {
            Account a = register();
            requestReset(a.email());
            String code = codeFor(a.email());
            confirm(a.email(), code, "reinitialise-1").statusCode(204);
            confirm(a.email(), code, "reinitialise-2").statusCode(400);
            login(a.email(), "reinitialise-1").statusCode(200);
        }

        /** The attempt cap holds even though each wrong attempt fails with a 400 (dontRollbackOn). */
        @Test
        void five_wrong_attempts_burn_the_code() {
            Account a = register();
            requestReset(a.email());
            String code = codeFor(a.email());
            for (int i = 0; i < 5; i++) {
                confirm(a.email(), "ZZZZ-ZZZZ", "reinitialise-1").statusCode(400)
                        .body("title", equalTo("Code invalide"));
            }
            confirm(a.email(), code, "reinitialise-1").statusCode(400);
            login(a.email(), "motdepasse8").statusCode(200);
        }

        @Test
        void an_expired_code_is_rejected() {
            Account a = register();
            requestReset(a.email());
            String code = codeFor(a.email());
            expireCodes(a.email());
            confirm(a.email(), code, "reinitialise-1").statusCode(400);
        }

        @Test
        void a_new_code_invalidates_the_previous_one() {
            Account a = register();
            requestReset(a.email());
            String first = codeFor(a.email());
            requestReset(a.email());
            String second = codeFor(a.email());
            confirm(a.email(), first, "reinitialise-1").statusCode(400);
            confirm(a.email(), second, "reinitialise-1").statusCode(204);
        }

        @Test
        void the_error_message_does_not_reveal_an_unknown_address() {
            String ghost = "absent-" + UUID.randomUUID() + "@example.com";
            confirm(ghost, "ABCD-EFGH", "reinitialise-1").statusCode(400)
                    .body("title", equalTo("Code invalide"));
        }
    }

    @Transactional
    void expireCodes(String email) {
        AccountCodeEntity.update("expiresAt = ?1 where userId = (select u.id from UserEntity u where u.email = ?2)",
                Instant.now().minusSeconds(1), email);
    }

    @Nested
    class EmailVerification {

        @Test
        void registration_sends_a_code_that_verifies_the_address() {
            Account a = register();
            given().header("Authorization", "Bearer " + a.token()).when().get("/api/v1/users/me")
                    .then().statusCode(200).body("emailVerified", equalTo(false));

            post(a, "/email-verification-confirmations", Map.of("code", codeFor(a.email())))
                    .statusCode(200)
                    .body("emailVerified", equalTo(true));
        }

        @Test
        void a_new_code_can_be_requested() {
            Account a = register();
            String first = codeFor(a.email());
            post(a, "/email-verifications", null).statusCode(202);
            String second = codeFor(a.email());
            assertFalse(first.equals(second));
            post(a, "/email-verification-confirmations", Map.of("code", first)).statusCode(400);
            post(a, "/email-verification-confirmations", Map.of("code", second)).statusCode(200);
        }
    }

    @Nested
    class EmailChange {

        static String freshAddress() {
            return "nouvelle-" + UUID.randomUUID() + "@example.com";
        }

        @Test
        void the_code_goes_to_the_new_address_and_the_old_one_stays_valid_until_confirmation() {
            Account a = register();
            String target = freshAddress();
            post(a, "/email-changes", Map.of("newEmail", target, "currentPassword", "motdepasse8"))
                    .statusCode(202);
            String code = codeFor(target);

            login(a.email(), "motdepasse8").statusCode(200); // nothing has changed yet
            login(target, "motdepasse8").statusCode(401);

            post(a, "/email-change-confirmations", Map.of("code", code))
                    .statusCode(200)
                    .body("email", equalTo(target))
                    .body("emailVerified", equalTo(true));

            login(target, "motdepasse8").statusCode(200);
            login(a.email(), "motdepasse8").statusCode(401);
            assertFalse(mailbox.sentTo(a.email()).stream()
                    .filter(m -> m.subject().contains("a changé")).toList().isEmpty(), "old address notified");
        }

        @Test
        void requires_the_current_password() {
            Account a = register();
            post(a, "/email-changes", Map.of("newEmail", freshAddress(), "currentPassword", "faux-mdp-1"))
                    .statusCode(403);
        }

        @Test
        void rejects_an_address_already_taken() {
            Account a = register();
            Account b = register();
            post(a, "/email-changes", Map.of("newEmail", b.email(), "currentPassword", "motdepasse8"))
                    .statusCode(409);
        }

        /** Another account takes the address between the request and the confirmation. */
        @Test
        void checks_uniqueness_again_on_confirmation() {
            Account a = register();
            String target = freshAddress();
            post(a, "/email-changes", Map.of("newEmail", target, "currentPassword", "motdepasse8"))
                    .statusCode(202);
            String code = codeFor(target);

            given().contentType("application/json")
                    .body(Map.of("email", target, "password", "motdepasse8"))
                    .when().post("/api/v1/auth/register").then().statusCode(201);

            post(a, "/email-change-confirmations", Map.of("code", code)).statusCode(409);
            login(a.email(), "motdepasse8").statusCode(200);
        }

        /**
         * CodeRabbit review (PR #78). Someone who knows the old password starts an email
         * change to an address they control; the victim resets their password. The
         * attacker's JWT still lives for a few minutes: it must no longer be enough to
         * confirm the change, otherwise they take the account over through the address.
         */
        @Test
        void a_password_reset_cancels_a_pending_email_change() {
            Account victim = register();
            String attackerAddress = freshAddress();
            post(victim, "/email-changes", Map.of("newEmail", attackerAddress, "currentPassword", "motdepasse8"))
                    .statusCode(202);
            String attackerCode = codeFor(attackerAddress);

            given().contentType("application/json").body(Map.of("email", victim.email()))
                    .when().post("/api/v1/auth/password-resets").then().statusCode(202);
            given().contentType("application/json")
                    .body(Map.of("email", victim.email(), "code", codeFor(victim.email()),
                            "newPassword", "reprise-en-main"))
                    .when().post("/api/v1/auth/password-reset-confirmations").then().statusCode(204);

            // The original access JWT is still valid: it's the one the attacker uses.
            post(victim, "/email-change-confirmations", Map.of("code", attackerCode)).statusCode(400);
            login(victim.email(), "reprise-en-main").statusCode(200);
        }

        @Test
        void a_password_change_also_cancels_a_pending_email_change() {
            Account a = register();
            String target = freshAddress();
            post(a, "/email-changes", Map.of("newEmail", target, "currentPassword", "motdepasse8"))
                    .statusCode(202);
            String code = codeFor(target);

            post(a, "/password", Map.of("currentPassword", "motdepasse8", "newPassword", "nouveau-mdp"))
                    .statusCode(200);

            post(a, "/email-change-confirmations", Map.of("code", code)).statusCode(400);
        }

        @Test
        void rejects_the_current_address() {
            Account a = register();
            post(a, "/email-changes", Map.of("newEmail", a.email().toUpperCase(), "currentPassword", "motdepasse8"))
                    .statusCode(422);
        }
    }

    @Test
    void codes_are_never_stored_in_clear_text() {
        Account a = register();
        String code = codeFor(a.email());
        String stored = storedHash(a.email());
        assertTrue(stored.startsWith("$2"), "BCrypt hash");
        assertFalse(stored.contains(code.replace("-", "")));
        assertEquals(60, stored.length());
    }

    @Transactional
    String storedHash(String email) {
        return AccountCodeEntity.<AccountCodeEntity>find(
                "userId = (select u.id from UserEntity u where u.email = ?1)", email).firstResult().codeHash;
    }
}
