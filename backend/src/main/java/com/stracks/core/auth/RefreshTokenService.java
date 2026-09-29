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
 * Refresh token lifecycle: issuing, rotation, revocation.
 *
 * <p>The secret is 256 random bits encoded in base64url. It's never persisted; the
 * database only holds its SHA-256. A plain hash is enough where BCrypt would be required
 * for a password: the secret is drawn at random with 256 bits of entropy, there is no
 * dictionary to run against a stolen hash.
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

    /** 60 days by default: "a session stays valid for several days" (DoD #44). */
    @ConfigProperty(name = "stracks.jwt.refresh-ttl-seconds", defaultValue = "5184000")
    long refreshTtlSeconds;

    /**
     * Tolerance window for the replay of a just-rotated token. Without it, a rotation
     * response lost on the way (common on the move) would log the user out mid-session,
     * exactly what #44 must prevent. Beyond it, the replay is treated as theft.
     */
    @ConfigProperty(name = "stracks.jwt.refresh-replay-grace-seconds", defaultValue = "60")
    long replayGraceSeconds;

    /** Result of a rotation: the new secret, and the user derived from the token. */
    public record Rotation(String secret, UUID userId) {
    }

    /** Opens a new family: on login and registration only. */
    @Transactional
    public String issueForNewSession(UUID userId) {
        return issue(userId, UUID.randomUUID()).secret();
    }

    /**
     * Consumes the presented token and issues a successor in the same family.
     *
     * @throws com.stracks.core.common.ApiException 401 if the token is unknown, expired,
     *         revoked outside the tolerance window, or if its family was compromised.
     */
    @Transactional
    public Rotation rotate(String presentedSecret) {
        Instant now = Instant.now();
        // Row lock: two concurrent rotations of the same token (two requests sent before
        // the first one answered) must be serialized, otherwise the family ends up with
        // two live tokens.
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
     * Logout: revokes the whole family of the presented token, not just the token.
     * Logging out of a device must leave nothing reusable behind.
     *
     * <p>Idempotent and silent on an unknown token: answering "known / unknown" would turn
     * the endpoint into a validity oracle.
     */
    @Transactional
    public void revokeSession(String presentedSecret) {
        RefreshTokenEntity.findByHash(hash(presentedSecret)).ifPresent(
                token -> RefreshTokenEntity.revokeFamily(token.familyId, Instant.now(), REASON_LOGOUT));
    }

    /**
     * Replay of a revoked token. Two possible readings:
     * <ul>
     *   <li>the client didn't receive the previous rotation's response and retries: we
     *       catch up by rotating from the family's live token;</li>
     *   <li>the token was stolen and replayed later: the whole family is dropped.</li>
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

    /** Walks the {@code replaced_by} chain up to the family's still-active token. */
    private RefreshTokenEntity followChain(RefreshTokenEntity from, Instant now) {
        RefreshTokenEntity current = from;
        // The chain is bounded by the family's number of rotations; the guard prevents
        // inconsistent data from looping the request forever.
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
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** Exposed for tests: a token's state without going through the HTTP layer. */
    static Optional<RefreshTokenEntity> peek(String secret) {
        return RefreshTokenEntity.findByHash(hash(secret));
    }
}
