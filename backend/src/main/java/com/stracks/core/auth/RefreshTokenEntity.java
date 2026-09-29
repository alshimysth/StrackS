package com.stracks.core.auth;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Refresh token (story #44). Only stores the SHA-256 hash of the secret: the secret itself
 * exists only once, in the HTTP response that issues it.
 *
 * <p>The link to the user is a plain UUID rather than a {@code @ManyToOne}:
 * {@code core/auth} only needs the identity, and account deletion is handled by the
 * {@code ON DELETE CASCADE} of migration V5.
 */
@Entity
@Table(name = "refresh_tokens")
public class RefreshTokenEntity extends PanacheEntityBase {

    @Id
    public UUID id;

    @Column(name = "user_id", nullable = false)
    public UUID userId;

    @Column(name = "token_hash", nullable = false, unique = true)
    public String tokenHash;

    /** One family = one login. Rotation keeps the same family id. */
    @Column(name = "family_id", nullable = false)
    public UUID familyId;

    /** Successor issued on rotation: traces the chain, never the secret. */
    @Column(name = "replaced_by")
    public UUID replacedBy;

    @Column(name = "issued_at", nullable = false)
    public Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    public Instant expiresAt;

    @Column(name = "revoked_at")
    public Instant revokedAt;

    @Column(name = "revoked_reason")
    public String revokedReason;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (issuedAt == null) {
            issuedAt = Instant.now();
        }
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public boolean isExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }

    public void revoke(Instant when, String reason) {
        revokedAt = when;
        revokedReason = reason;
    }

    public static Optional<RefreshTokenEntity> findByHash(String tokenHash) {
        return find("tokenHash", tokenHash).firstResultOptional();
    }

    /** Same, but locks the row: reserved for the rotation path. */
    public static Optional<RefreshTokenEntity> findByHashForUpdate(String tokenHash) {
        return find("tokenHash", tokenHash)
                .withLock(LockModeType.PESSIMISTIC_WRITE)
                .firstResultOptional();
    }

    /**
     * Revokes all of a user's sessions: after a password change or reset (#73, #74), no
     * device may extend a session opened with the old secret.
     */
    public static long revokeAllForUser(UUID userId, Instant when, String reason) {
        return update("revokedAt = ?1, revokedReason = ?2 where userId = ?3 and revokedAt is null",
                when, reason, userId);
    }

    /** Purge (#50): only touches tokens that expired before {@code before}. */
    public static long deleteExpiredBefore(Instant before) {
        return delete("expiresAt < ?1", before);
    }

    /** Revokes the whole family at once: reaction to the replay of an already rotated token. */
    public static long revokeFamily(UUID familyId, Instant when, String reason) {
        return update("revokedAt = ?1, revokedReason = ?2 where familyId = ?3 and revokedAt is null",
                when, reason, familyId);
    }
}
