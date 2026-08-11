package com.stracks.core.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Cycle de vie des jetons de renouvellement : émission, rotation, révocation.
 *
 * <p>Le secret est un aléa de 256 bits encodé en base64url. Il n'est jamais persisté ;
 * la base ne contient que son SHA-256. Un hachage simple suffit là où BCrypt serait
 * requis pour un mot de passe : le secret est tiré au sort avec 256 bits d'entropie,
 * il n'y a pas de dictionnaire à opposer à une empreinte volée.
 */
@ApplicationScoped
public class RefreshTokenService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int SECRET_BYTES = 32;

    static final String REASON_ROTATED = "rotated";
    static final String REASON_LOGOUT = "logout";
    static final String REASON_REUSE = "reuse-detected";

    @Inject
    RefreshTokenRevoker revoker;

    /** 60 jours par défaut : « une session reste valide plusieurs jours » (DoD #44). */
    @ConfigProperty(name = "stracks.jwt.refresh-ttl-seconds", defaultValue = "5184000")
    long refreshTtlSeconds;

    /**
     * Fenêtre de tolérance au rejeu d'un jeton tout juste tourné. Sans elle, une réponse
     * de rotation perdue en route — banal en mobilité — déconnecterait l'utilisateur en
     * pleine séance, exactement ce que #44 doit empêcher. Au-delà, le rejeu est traité
     * comme un vol.
     */
    @ConfigProperty(name = "stracks.jwt.refresh-replay-grace-seconds", defaultValue = "60")
    long replayGraceSeconds;

    /** Résultat d'une rotation : le nouveau secret, et l'utilisateur déduit du jeton. */
    public record Rotation(String secret, UUID userId) {
    }

    /** Ouvre une nouvelle famille : à la connexion et à l'inscription uniquement. */
    @Transactional
    public String issueForNewSession(UUID userId) {
        return issue(userId, UUID.randomUUID()).secret();
    }

    /**
     * Consomme le jeton présenté et en émet un successeur dans la même famille.
     *
     * @throws com.stracks.core.common.ApiException 401 si le jeton est inconnu, expiré,
     *         révoqué hors fenêtre de tolérance, ou si sa famille a été compromise.
     */
    @Transactional
    public Rotation rotate(String presentedSecret) {
        Instant now = Instant.now();
        // Verrou de ligne : deux rotations concurrentes du même jeton (deux requêtes
        // parties avant que la première ne réponde) doivent se sérialiser, sinon la
        // famille se retrouve avec deux jetons vivants.
        RefreshTokenEntity token = RefreshTokenEntity.findByHashForUpdate(hash(presentedSecret))
                .orElseThrow(AuthErrors::invalidRefreshToken);

        if (token.isExpired(now)) {
            throw AuthErrors.invalidRefreshToken();
        }

        if (token.isRevoked()) {
            return handleReplay(token, now);
        }

        token.revoke(now, REASON_ROTATED);
        Issued successor = issue(token.userId, token.familyId);
        token.replacedBy = successor.entity().id;
        return new Rotation(successor.secret(), token.userId);
    }

    /**
     * Déconnexion : révoque toute la famille du jeton présenté, pas seulement le jeton.
     * Se déconnecter d'un appareil ne doit rien laisser de réutilisable derrière soi.
     *
     * <p>Idempotent et silencieux sur un jeton inconnu — répondre « connu / inconnu »
     * transformerait l'endpoint en oracle de validité.
     */
    @Transactional
    public void revokeSession(String presentedSecret) {
        RefreshTokenEntity.findByHash(hash(presentedSecret)).ifPresent(
                token -> RefreshTokenEntity.revokeFamily(token.familyId, Instant.now(), REASON_LOGOUT));
    }

    /**
     * Rejeu d'un jeton révoqué. Deux lectures possibles :
     * <ul>
     *   <li>le client n'a pas reçu la réponse de la rotation précédente et réessaie —
     *       on le rattrape en tournant depuis le jeton vivant de la famille ;</li>
     *   <li>le jeton a été volé et rejoué plus tard — la famille entière tombe.</li>
     * </ul>
     */
    private Rotation handleReplay(RefreshTokenEntity replayed, Instant now) {
        boolean benignRetry = REASON_ROTATED.equals(replayed.revokedReason)
                && replayed.revokedAt.isAfter(now.minusSeconds(replayGraceSeconds));

        if (!benignRetry) {
            revoker.revokeFamily(replayed.familyId, now, REASON_REUSE);
            throw AuthErrors.invalidRefreshToken();
        }

        RefreshTokenEntity live = followChain(replayed, now);
        live.revoke(now, REASON_ROTATED);
        Issued successor = issue(live.userId, live.familyId);
        live.replacedBy = successor.entity().id;
        return new Rotation(successor.secret(), live.userId);
    }

    /** Remonte la chaîne {@code replaced_by} jusqu'au jeton encore actif de la famille. */
    private RefreshTokenEntity followChain(RefreshTokenEntity from, Instant now) {
        RefreshTokenEntity current = from;
        // La chaîne est bornée par le nombre de rotations de la famille ; la garde évite
        // qu'une donnée incohérente ne fasse boucler la requête indéfiniment.
        for (int hops = 0; hops < 64; hops++) {
            if (current.replacedBy == null) {
                break;
            }
            RefreshTokenEntity next = RefreshTokenEntity.findById(current.replacedBy);
            if (next == null) {
                break;
            }
            current = next;
        }
        if (current.isRevoked() || current.isExpired(now)) {
            revoker.revokeFamily(from.familyId, now, REASON_REUSE);
            throw AuthErrors.invalidRefreshToken();
        }
        return current;
    }

    private record Issued(String secret, RefreshTokenEntity entity) {
    }

    private Issued issue(UUID userId, UUID familyId) {
        byte[] raw = new byte[SECRET_BYTES];
        RANDOM.nextBytes(raw);
        String secret = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        RefreshTokenEntity token = new RefreshTokenEntity();
        token.userId = userId;
        token.familyId = familyId;
        token.tokenHash = hash(secret);
        token.issuedAt = Instant.now();
        token.expiresAt = token.issuedAt.plus(Duration.ofSeconds(refreshTtlSeconds));
        token.persist();

        return new Issued(secret, token);
    }

    static String hash(String secret) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(secret.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponible", e);
        }
    }

    /** Exposé pour les tests : état d'un jeton sans passer par la couche HTTP. */
    static Optional<RefreshTokenEntity> peek(String secret) {
        return RefreshTokenEntity.findByHash(hash(secret));
    }
}
