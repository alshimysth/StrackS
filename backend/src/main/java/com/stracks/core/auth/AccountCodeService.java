package com.stracks.core.auth;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import com.stracks.core.common.ApiException;

import io.quarkus.elytron.security.common.BcryptUtil;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Émission et vérification des codes à usage unique (#74, #75).
 *
 * <p><b>Pourquoi un code et pas un lien.</b> Un lien de réinitialisation suppose une page
 * web ou un lien profond (`stracks://…`), et échoue dès que l'email est ouvert sur un
 * autre appareil que le téléphone. Un code se recopie partout.
 *
 * <p><b>Pourquoi c'est sûr malgré une entropie modeste.</b> 8 caractères sur un alphabet de
 * 32 (sans 0/O ni 1/I) font 40 bits. En ligne, un attaquant dispose de
 * {@code max-attempts} essais par code avant qu'il ne soit brûlé, sur une durée de vie de
 * quelques minutes, derrière la limitation de débit de #72. Hors ligne (fuite de la base),
 * l'empreinte est en BCrypt et non en SHA-256 : 2^40 essais BCrypt ne se font pas dans la
 * durée de vie du code.
 */
@ApplicationScoped
public class AccountCodeService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final int LENGTH = 8;

    /** Motifs d'un code. Valeur stockée en TEXT, jamais d'ENUM SQL. */
    public enum Purpose {
        PASSWORD_RESET("password-reset"),
        EMAIL_CHANGE("email-change"),
        EMAIL_VERIFICATION("email-verification");

        final String code;

        Purpose(String code) {
            this.code = code;
        }
    }

    /** Un code émis : sa valeur en clair n'existe que dans l'email qui la porte. */
    public record Issued(String code, Instant expiresAt) {
    }

    @ConfigProperty(name = "stracks.account.code.max-attempts", defaultValue = "5")
    int maxAttempts;

    @ConfigProperty(name = "stracks.account.code.password-reset-ttl", defaultValue = "PT15M")
    Duration passwordResetTtl;

    @ConfigProperty(name = "stracks.account.code.email-change-ttl", defaultValue = "PT30M")
    Duration emailChangeTtl;

    @ConfigProperty(name = "stracks.account.code.email-verification-ttl", defaultValue = "PT24H")
    Duration emailVerificationTtl;

    @Transactional
    public Issued issue(UUID userId, Purpose purpose, String targetEmail) {
        Instant now = Instant.now();
        AccountCodeEntity.closeActive(userId, purpose.code, now);

        String code = generate();
        AccountCodeEntity entity = new AccountCodeEntity();
        entity.userId = userId;
        entity.purpose = purpose.code;
        entity.codeHash = BcryptUtil.bcryptHash(code);
        entity.targetEmail = targetEmail;
        entity.expiresAt = now.plus(ttl(purpose));
        entity.persist();
        return new Issued(format(code), entity.expiresAt);
    }

    /**
     * Consomme le code présenté, ou lève une erreur 400 générique.
     *
     * <p>Un seul message pour « inconnu », « expiré », « déjà utilisé », « épuisé » et
     * « faux » : les distinguer dirait à un attaquant quand insister.
     *
     * <p>{@code dontRollbackOn} est indispensable : un essai faux doit être <b>compté même
     * si la requête échoue</b>. Sans lui, l'exception annulerait l'incrément et le plafond
     * d'essais ne protégerait de rien.
     *
     * @return la ligne consommée ({@code targetEmail} pour un changement d'adresse)
     */
    @Transactional(dontRollbackOn = ApiException.class)
    public AccountCodeEntity consume(UUID userId, Purpose purpose, String presented) {
        Instant now = Instant.now();
        AccountCodeEntity code = AccountCodeEntity.findActiveForUpdate(userId, purpose.code)
                .orElseThrow(AccountCodeService::invalidCode);
        if (!code.expiresAt.isAfter(now) || code.attempts >= maxAttempts) {
            code.consumedAt = now;
            throw invalidCode();
        }
        if (!BcryptUtil.matches(normalize(presented), code.codeHash)) {
            code.attempts += 1;
            if (code.attempts >= maxAttempts) {
                code.consumedAt = now; // brûlé : il faudra en redemander un
            }
            throw invalidCode();
        }
        code.consumedAt = now;
        return code;
    }

    /**
     * Coût BCrypt équivalent à une émission, sans rien émettre : appelé quand l'adresse
     * n'a pas de compte, pour que le temps de réponse ne trahisse pas son existence.
     */
    public void simulateIssue() {
        BcryptUtil.bcryptHash(generate());
    }

    static ApiException invalidCode() {
        return new ApiException(400, "Code invalide",
                "Ce code est invalide ou a expiré. Demandes-en un nouveau.");
    }

    private Duration ttl(Purpose purpose) {
        return switch (purpose) {
            case PASSWORD_RESET -> passwordResetTtl;
            case EMAIL_CHANGE -> emailChangeTtl;
            case EMAIL_VERIFICATION -> emailVerificationTtl;
        };
    }

    private static String generate() {
        StringBuilder out = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            out.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return out.toString();
    }

    /** {@code ABCD2345} → {@code ABCD-2345}, plus lisible à recopier. */
    private static String format(String code) {
        return code.substring(0, 4) + "-" + code.substring(4);
    }

    /** Tolère minuscules, tiret et espaces : l'utilisateur recopie, il ne tape pas au caractère près. */
    static String normalize(String presented) {
        return presented == null ? "" : presented.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }
}
