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

/** Cycle de vie des secrets du compte : #73 mot de passe, #74 oubli, #75 email. */
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
        return mailbox.lastCodeFor(address).orElseThrow(() -> new AssertionError("aucun code reçu par " + address));
    }

    @Nested
    class ChangementDeMotDePasse {

        /** 403 et pas 401 : le client mobile prendrait un 401 pour une session expirée. */
        @Test
        void un_mauvais_mot_de_passe_actuel_repond_403() {
            Account a = register();
            post(a, "/password", Map.of("currentPassword", "faux-mdp-1", "newPassword", "nouveau-mdp"))
                    .statusCode(403);
            login(a.email(), "motdepasse8").statusCode(200);
        }

        @Test
        void change_le_mot_de_passe_et_coupe_les_autres_sessions() {
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
            refresh(renewed.getString("refreshToken")).statusCode(200); // l'appareil courant reste connecté

            login(a.email(), "motdepasse8").statusCode(401);
            login(a.email(), "nouveau-mdp").statusCode(200);
            assertFalse(mailbox.sentTo(a.email()).stream()
                    .filter(m -> m.subject().contains("modifié")).toList().isEmpty(), "alerte envoyée");
        }

        @Test
        void refuse_un_nouveau_mot_de_passe_trop_court() {
            Account a = register();
            post(a, "/password", Map.of("currentPassword", "motdepasse8", "newPassword", "court"))
                    .statusCode(400);
        }
    }

    @Nested
    class MotDePasseOublie {

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
        void une_adresse_sans_compte_recoit_la_meme_reponse_et_aucun_email() {
            String ghost = "absent-" + UUID.randomUUID() + "@example.com";
            requestReset(ghost).statusCode(202);
            assertTrue(mailbox.sentTo(ghost).isEmpty());
        }

        @Test
        void le_code_recu_permet_de_choisir_un_nouveau_mot_de_passe_et_coupe_les_sessions() {
            Account a = register();
            requestReset(a.email()).statusCode(202);
            String code = codeFor(a.email());

            // Recopié en minuscules et sans tiret : toléré.
            confirm(a.email(), code.toLowerCase().replace("-", ""), "reinitialise-1").statusCode(204);

            refresh(a.refreshToken()).statusCode(401);
            login(a.email(), "motdepasse8").statusCode(401);
            login(a.email(), "reinitialise-1").statusCode(200)
                    .body("user.emailVerified", equalTo(true)); // le code prouvait le contrôle de l'adresse
        }

        @Test
        void un_code_ne_sert_qu_une_fois() {
            Account a = register();
            requestReset(a.email());
            String code = codeFor(a.email());
            confirm(a.email(), code, "reinitialise-1").statusCode(204);
            confirm(a.email(), code, "reinitialise-2").statusCode(400);
            login(a.email(), "reinitialise-1").statusCode(200);
        }

        /** Le plafond d'essais tient même si chaque essai faux échoue en 400 (dontRollbackOn). */
        @Test
        void cinq_essais_faux_brulent_le_code() {
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
        void un_code_expire_est_refuse() {
            Account a = register();
            requestReset(a.email());
            String code = codeFor(a.email());
            expireCodes(a.email());
            confirm(a.email(), code, "reinitialise-1").statusCode(400);
        }

        @Test
        void un_nouveau_code_invalide_le_precedent() {
            Account a = register();
            requestReset(a.email());
            String first = codeFor(a.email());
            requestReset(a.email());
            String second = codeFor(a.email());
            confirm(a.email(), first, "reinitialise-1").statusCode(400);
            confirm(a.email(), second, "reinitialise-1").statusCode(204);
        }

        @Test
        void le_message_d_erreur_ne_distingue_pas_une_adresse_inconnue() {
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
    class VerificationDEmail {

        @Test
        void l_inscription_envoie_un_code_qui_verifie_l_adresse() {
            Account a = register();
            given().header("Authorization", "Bearer " + a.token()).when().get("/api/v1/users/me")
                    .then().statusCode(200).body("emailVerified", equalTo(false));

            post(a, "/email-verification-confirmations", Map.of("code", codeFor(a.email())))
                    .statusCode(200)
                    .body("emailVerified", equalTo(true));
        }

        @Test
        void on_peut_redemander_un_code() {
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
    class ChangementDEmail {

        static String freshAddress() {
            return "nouvelle-" + UUID.randomUUID() + "@example.com";
        }

        @Test
        void le_code_part_vers_la_nouvelle_adresse_et_l_ancienne_reste_valable_jusqu_a_confirmation() {
            Account a = register();
            String target = freshAddress();
            post(a, "/email-changes", Map.of("newEmail", target, "currentPassword", "motdepasse8"))
                    .statusCode(202);
            String code = codeFor(target);

            login(a.email(), "motdepasse8").statusCode(200); // rien n'a encore changé
            login(target, "motdepasse8").statusCode(401);

            post(a, "/email-change-confirmations", Map.of("code", code))
                    .statusCode(200)
                    .body("email", equalTo(target))
                    .body("emailVerified", equalTo(true));

            login(target, "motdepasse8").statusCode(200);
            login(a.email(), "motdepasse8").statusCode(401);
            assertFalse(mailbox.sentTo(a.email()).stream()
                    .filter(m -> m.subject().contains("a changé")).toList().isEmpty(), "ancienne adresse prévenue");
        }

        @Test
        void exige_le_mot_de_passe_actuel() {
            Account a = register();
            post(a, "/email-changes", Map.of("newEmail", freshAddress(), "currentPassword", "faux-mdp-1"))
                    .statusCode(403);
        }

        @Test
        void refuse_une_adresse_deja_prise() {
            Account a = register();
            Account b = register();
            post(a, "/email-changes", Map.of("newEmail", b.email(), "currentPassword", "motdepasse8"))
                    .statusCode(409);
        }

        /** Un autre compte prend l'adresse entre la demande et la confirmation. */
        @Test
        void revérifie_l_unicite_a_la_confirmation() {
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
         * Revue CodeRabbit (PR #78). Quelqu'un qui connaît l'ancien mot de passe lance un
         * changement d'email vers une adresse qu'il contrôle ; la victime réinitialise son
         * mot de passe. Le JWT de l'attaquant vit encore quelques minutes : il ne doit plus
         * suffire à confirmer le changement, sinon il reprend le compte par l'adresse.
         */
        @Test
        void une_reinitialisation_du_mot_de_passe_annule_un_changement_d_email_en_attente() {
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

            // Le JWT d'accès d'origine est encore valide : c'est lui que l'attaquant utilise.
            post(victim, "/email-change-confirmations", Map.of("code", attackerCode)).statusCode(400);
            login(victim.email(), "reprise-en-main").statusCode(200);
        }

        @Test
        void un_changement_de_mot_de_passe_annule_aussi_un_changement_d_email_en_attente() {
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
        void refuse_l_adresse_actuelle() {
            Account a = register();
            post(a, "/email-changes", Map.of("newEmail", a.email().toUpperCase(), "currentPassword", "motdepasse8"))
                    .statusCode(422);
        }
    }

    @Test
    void les_codes_ne_sont_jamais_stockes_en_clair() {
        Account a = register();
        String code = codeFor(a.email());
        String stored = storedHash(a.email());
        assertTrue(stored.startsWith("$2"), "empreinte BCrypt");
        assertFalse(stored.contains(code.replace("-", "")));
        assertEquals(60, stored.length());
    }

    @Transactional
    String storedHash(String email) {
        return AccountCodeEntity.<AccountCodeEntity>find(
                "userId = (select u.id from UserEntity u where u.email = ?1)", email).firstResult().codeHash;
    }
}
