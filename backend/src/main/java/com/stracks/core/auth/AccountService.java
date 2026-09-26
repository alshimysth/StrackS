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
 * Cycle de vie des secrets du compte : mot de passe (#73, #74) et adresse email (#75).
 *
 * <p>Deux règles traversent toute la classe :
 * <ul>
 *   <li><b>Un mauvais mot de passe actuel répond 403, jamais 401.</b> Le client mobile lit
 *       un 401 comme « jeton expiré » : il tenterait un renouvellement, puis déconnecterait
 *       l'utilisateur pour une simple faute de frappe.</li>
 *   <li><b>Changer de secret coupe toutes les autres sessions.</b> Un JWT d'accès reste
 *       valable jusqu'à son expiration (15 min, #49) — c'est la limite assumée d'un jeton
 *       non révocable ; les refresh tokens, eux, tombent immédiatement.</li>
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

    // --- Mot de passe ------------------------------------------------------------

    /** #73. Rend une session neuve pour l'appareil courant : les autres sont révoquées. */
    @Transactional
    public AuthService.AuthResult changePassword(UUID userId, String currentPassword, String newPassword) {
        UserEntity user = requireUser(userId);
        requireCurrentPassword(user, currentPassword);
        user.passwordHash = BcryptUtil.bcryptHash(newPassword);
        RefreshTokenEntity.revokeAllForUser(user.id, Instant.now(), REASON_PASSWORD_CHANGED);
        mail.send(new EmailMessage(user.email, "Ton mot de passe StrackS a été modifié",
                """
                Le mot de passe de ton compte StrackS vient d'être modifié.
                Toutes tes autres sessions ont été fermées.

                Si ce n'est pas toi, réinitialise-le tout de suite depuis l'écran de connexion
                (« Mot de passe oublié »).""", null));
        return authService.issueSession(user);
    }

    /**
     * #74. Réponse identique que l'adresse ait un compte ou non — y compris en temps :
     * sans compte, on paie quand même le coût BCrypt d'une émission.
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
     * #74. Le code a été reçu sur l'adresse du compte : c'est aussi une preuve de contrôle
     * de cette adresse, qui devient vérifiée.
     */
    @Transactional(dontRollbackOn = ApiException.class)
    public void confirmPasswordReset(String email, String code, String newPassword) {
        UserEntity user = UserEntity.findByEmail(normalizeEmail(email))
                .orElseThrow(AccountCodeService::invalidCode); // même message qu'un code faux
        codes.consume(user.id, Purpose.PASSWORD_RESET, code);
        user.passwordHash = BcryptUtil.bcryptHash(newPassword);
        if (user.emailVerifiedAt == null) {
            user.emailVerifiedAt = Instant.now();
        }
        RefreshTokenEntity.revokeAllForUser(user.id, Instant.now(), REASON_PASSWORD_RESET);
    }

    // --- Adresse email -----------------------------------------------------------

    /** #75. Envoie un code à l'adresse actuelle du compte. Sans effet si elle est déjà vérifiée. */
    @Transactional
    public void requestEmailVerification(UUID userId) {
        UserEntity user = requireUser(userId);
        if (user.emailVerifiedAt != null) {
            return;
        }
        sendVerificationCode(user);
    }

    /** Appelé à l'inscription. Un échec d'envoi ne fait pas échouer l'inscription. */
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
     * #75. Le code part vers la <b>nouvelle</b> adresse : c'est elle dont il faut prouver le
     * contrôle. L'adresse du compte ne change qu'à la confirmation — d'ici là, la connexion
     * se fait toujours avec l'ancienne.
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
     * #75. L'unicité est revérifiée ici : un autre compte a pu prendre l'adresse entre la
     * demande et la confirmation. L'ancienne adresse est prévenue — c'est le seul signal
     * qu'aurait la victime d'un détournement de compte.
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
