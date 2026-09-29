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
 * Issuing and checking one-time codes (#74, #75).
 *
 * <p><b>Why a code and not a link.</b> A reset link requires a web page or a deep link
 * (`stracks://…`), and fails as soon as the email is opened on a device other than the
 * phone. A code can be copied anywhere.
 *
 * <p><b>Why it's safe despite a modest entropy.</b> 8 characters from a 32-letter alphabet
 * (no 0/O or 1/I) make 40 bits. Online, an attacker gets {@code max-attempts} tries per
 * code before it's burnt, over a lifetime of a few minutes, behind the rate limiting of
 * #72. Offline (database leak), the hash is BCrypt, not SHA-256: 2^40 BCrypt attempts
 * can't be done within the code's lifetime.
 */
@ApplicationScoped
public class AccountCodeService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final int LENGTH = 8;

    /** Purposes of a code. Stored as TEXT, never as an SQL ENUM. */
    public enum Purpose {
        PASSWORD_RESET("password-reset"),
        EMAIL_CHANGE("email-change"),
        EMAIL_VERIFICATION("email-verification");

        final String code;

        Purpose(String code) {
            this.code = code;
        }
    }

    /** An issued code: its clear value only exists in the email carrying it. */
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
     * Consumes the presented code, or throws a generic 400 error.
     *
     * <p>A single message for "unknown", "expired", "already used", "exhausted" and
     * "wrong": telling them apart would tell an attacker when to insist.
     *
     * <p>{@code dontRollbackOn} is essential: a wrong attempt must be <b>counted even when
     * the request fails</b>. Without it, the exception would roll back the increment and the
     * attempt cap would protect nothing.
     *
     * @return the consumed row ({@code targetEmail} for an address change)
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
                code.consumedAt = now; // burnt: a new one will have to be requested
            }
            throw invalidCode();
        }
        code.consumedAt = now;
        return code;
    }

    /**
     * BCrypt cost equivalent to issuing a code, without issuing anything: called when the
     * address has no account, so that the response time doesn't reveal whether it exists.
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

    /** {@code ABCD2345} → {@code ABCD-2345}, easier to copy. */
    private static String format(String code) {
        return code.substring(0, 4) + "-" + code.substring(4);
    }

    /** Tolerates lowercase, dashes and spaces: the user copies the code, not character-perfect. */
    static String normalize(String presented) {
        return presented == null ? "" : presented.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }
}
