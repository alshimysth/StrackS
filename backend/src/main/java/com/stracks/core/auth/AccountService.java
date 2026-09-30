package com.stracks.core.auth;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import com.stracks.core.auth.AccountCodeService.Purpose;
import com.stracks.core.common.ApiException;
import com.stracks.core.mail.EmailMessage;
import com.stracks.core.mail.EmailSender;
import com.stracks.core.user.UserEntity;

import io.quarkus.elytron.security.common.BcryptUtil;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

/**
 * Lifecycle of the account's secrets: password (#73, #74) and email address (#75).
 *
 * <p>Two rules run through the whole class:
 * <ul>
 *   <li><b>A wrong current password answers 403, never 401.</b> The mobile client reads a
 *       401 as "token expired": it would try a refresh, then log the user out over a
 *       simple typo.</li>
 *   <li><b>Changing a secret cuts all other sessions.</b> An access JWT stays valid until
 *       it expires (15 min, #49), the accepted limit of a non-revocable token; refresh
 *       tokens, however, are dropped immediately, and with them every code still open.
 *       Otherwise a still-alive JWT would be enough to confirm an email change started
 *       before the account was taken back, and then to take the account over.</li>
 * </ul>
 */
@ApplicationScoped
public class AccountService {

    static final String REASON_PASSWORD_CHANGED = "password-changed";
    static final String REASON_PASSWORD_RESET = "password-reset";

    private static final DateTimeFormatter EXPIRY = DateTimeFormatter.ofPattern("HH:mm", Locale.FRANCE)
            .withZone(ZoneId.of("Europe/Paris"));

    @Inject
    AuthService authService;

    @Inject
    AccountCodeService codes;

    @Inject
    EmailSender mail;

    // --- Password ------------------------------------------------------------------

    /** #73. Returns a fresh session for the current device: the others are revoked. */
    @Transactional
    public AuthService.AuthResult changePassword(UUID userId, String currentPassword, String newPassword) {
        UserEntity user = requireUser(userId);
        requireCurrentPassword(user, currentPassword);
        user.passwordHash = BcryptUtil.bcryptHash(newPassword);
        RefreshTokenEntity.revokeAllForUser(user.id, Instant.now(), REASON_PASSWORD_CHANGED);
        AccountCodeEntity.closeAllActive(user.id, Instant.now());
        mail.send(new EmailMessage(user.email, "Ton mot de passe StrackS a été modifié",
                """
                Le mot de passe de ton compte StrackS vient d'être modifié.
                Toutes tes autres sessions ont été fermées.

                Si ce n'est pas toi, réinitialise-le tout de suite depuis l'écran de connexion
                (« Mot de passe oublié »).""", null));
        return authService.issueSession(user);
    }

    /**
     * #74. Same response whether or not the address has an account, timing included:
     * without an account, we still pay the BCrypt cost of issuing a code.
     */
    @Transactional
    public void requestPasswordReset(String email) {
        Optional<UserEntity> user = UserEntity.findByEmail(normalizeEmail(email));
        if (user.isEmpty()) {
            codes.simulateIssue();
            return;
        }
        AccountCodeService.Issued issued = codes.issue(user.get().id, Purpose.PASSWORD_RESET, null);
        mail.send(new EmailMessage(user.get().email, "Ton code de réinitialisation StrackS",
                """
                Voici ton code pour choisir un nouveau mot de passe :

                    %s

                Il est valable jusqu'à %s et ne sert qu'une fois.
                Si tu n'as rien demandé, ignore cet email : ton mot de passe ne change pas."""
                        .formatted(issued.code(), EXPIRY.format(issued.expiresAt())),
                issued.code()));
    }

    /**
     * #74. The code was received at the account's address: that also proves control of
     * the address, which becomes verified.
     */
    @Transactional(dontRollbackOn = ApiException.class)
    public void confirmPasswordReset(String email, String code, String newPassword) {
        UserEntity user = UserEntity.findByEmail(normalizeEmail(email))
                .orElseThrow(AccountCodeService::invalidCode); // same message as a wrong code
        codes.consume(user.id, Purpose.PASSWORD_RESET, code);
        user.passwordHash = BcryptUtil.bcryptHash(newPassword);
        if (user.emailVerifiedAt == null) {
            user.emailVerifiedAt = Instant.now();
        }
        RefreshTokenEntity.revokeAllForUser(user.id, Instant.now(), REASON_PASSWORD_RESET);
        // The reset code is already consumed; the others (a pending email change, opened
        // by someone who knew the old password) are dropped too.
        AccountCodeEntity.closeAllActive(user.id, Instant.now());
    }

    // --- Email address ------------------------------------------------------------

    /** #75. Sends a code to the account's current address. No effect if already verified. */
    @Transactional
    public void requestEmailVerification(UUID userId) {
        UserEntity user = requireUser(userId);
        if (user.emailVerifiedAt != null) {
            return;
        }
        sendVerificationCode(user);
    }

    /** Called at registration. A sending failure doesn't make registration fail. */
    void sendVerificationCode(UserEntity user) {
        AccountCodeService.Issued issued = codes.issue(user.id, Purpose.EMAIL_VERIFICATION, null);
        mail.send(new EmailMessage(user.email, "Confirme ton adresse StrackS",
                """
                Voici ton code pour confirmer ton adresse email :

                    %s

                Saisis-le dans l'app, rubrique Profil. Il est valable 24 h."""
                        .formatted(issued.code()),
                issued.code()));
    }

    @Transactional(dontRollbackOn = ApiException.class)
    public UserEntity confirmEmailVerification(UUID userId, String code) {
        UserEntity user = requireUser(userId);
        codes.consume(user.id, Purpose.EMAIL_VERIFICATION, code);
        user.emailVerifiedAt = Instant.now();
        return user;
    }

    /**
     * #75. The code goes to the <b>new</b> address: that's the one whose control must be
     * proven. The account's address only changes on confirmation; until then, login still
     * uses the old one.
     */
    @Transactional
    public void requestEmailChange(UUID userId, String newEmail, String currentPassword) {
        UserEntity user = requireUser(userId);
        requireCurrentPassword(user, currentPassword);
        String target = normalizeEmail(newEmail);
        if (target.equals(user.email)) {
            throw new ApiException(422, "Adresse inchangée", "C'est déjà l'adresse de ton compte.");
        }
        if (UserEntity.findByEmail(target).isPresent()) {
            throw ApiException.emailAlreadyUsed();
        }
        AccountCodeService.Issued issued = codes.issue(user.id, Purpose.EMAIL_CHANGE, target);
        mail.send(new EmailMessage(target, "Confirme ta nouvelle adresse StrackS",
                """
                Voici ton code pour faire de cette adresse celle de ton compte StrackS :

                    %s

                Il est valable jusqu'à %s. Si tu n'as rien demandé, ignore cet email."""
                        .formatted(issued.code(), EXPIRY.format(issued.expiresAt())),
                issued.code()));
    }

    /**
     * #75. Uniqueness is checked again here: another account may have taken the address
     * between the request and the confirmation. The old address is notified: it's the only
     * signal the victim of an account takeover would get.
     */
    @Transactional(dontRollbackOn = ApiException.class)
    public UserEntity confirmEmailChange(UUID userId, String code) {
        UserEntity user = requireUser(userId);
        AccountCodeEntity consumed = codes.consume(user.id, Purpose.EMAIL_CHANGE, code);
        String target = consumed.targetEmail;
        if (UserEntity.findByEmail(target).filter(other -> !other.id.equals(user.id)).isPresent()) {
            throw ApiException.emailAlreadyUsed();
        }
        String previous = user.email;
        user.email = target;
        user.emailVerifiedAt = Instant.now();
        // A reset code already sent to the old address must no longer open the account
        // now attached to the new one.
        AccountCodeEntity.closeAllActive(user.id, Instant.now());
        mail.send(new EmailMessage(previous, "L'adresse de ton compte StrackS a changé",
                """
                L'adresse email de ton compte StrackS n'est plus celle-ci : elle a été remplacée
                par %s.

                Si ce n'est pas toi, réponds à cet email sans attendre."""
                        .formatted(target), null));
        return user;
    }

    // -----------------------------------------------------------------------------

    private static UserEntity requireUser(UUID userId) {
        UserEntity user = UserEntity.findById(userId);
        if (user == null) {
            throw ApiException.notFound("Utilisateur");
        }
        return user;
    }

    private static void requireCurrentPassword(UserEntity user, String presented) {
        if (presented == null || !BcryptUtil.matches(presented, user.passwordHash)) {
            throw new ApiException(403, "Mot de passe incorrect", "Le mot de passe actuel ne correspond pas.");
        }
    }

    static String normalizeEmail(String email) {
        return email == null ? "" : email.toLowerCase(Locale.ROOT).trim();
    }
}
