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
 * Jeton de renouvellement (Story #44). Ne porte que l'empreinte SHA-256 du secret :
 * le secret lui-même n'existe qu'une fois, dans la réponse HTTP qui l'émet.
 *
 * <p>Le lien vers l'utilisateur est un simple UUID plutôt qu'un {@code @ManyToOne} :
 * {@code core/auth} n'a besoin que de l'identité, et la suppression de compte est prise
 * en charge par le {@code ON DELETE CASCADE} de la migration V5.
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

    /** Une famille = une connexion. La rotation garde le même identifiant de famille. */
    @Column(name = "family_id", nullable = false)
    public UUID familyId;

    /** Successeur émis lors de la rotation — trace la chaîne, jamais le secret. */
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

    /** Idem, mais verrouille la ligne : réservé au chemin de rotation. */
    public static Optional<RefreshTokenEntity> findByHashForUpdate(String tokenHash) {
        return find("tokenHash", tokenHash)
                .withLock(LockModeType.PESSIMISTIC_WRITE)
                .firstResultOptional();
    }

    /**
     * Révoque toutes les sessions d'un utilisateur : après un changement ou une
     * réinitialisation de mot de passe (#73, #74), aucun appareil ne doit pouvoir
     * prolonger une session ouverte avec l'ancien secret.
     */
    public static long revokeAllForUser(UUID userId, Instant when, String reason) {
        return update("revokedAt = ?1, revokedReason = ?2 where userId = ?3 and revokedAt is null",
                when, reason, userId);
    }

    /** Purge (#50) : ne touche qu'aux jetons expirés depuis avant {@code before}. */
    public static long deleteExpiredBefore(Instant before) {
        return delete("expiresAt < ?1", before);
    }

    /** Révoque d'un coup toute la famille — réaction au rejeu d'un jeton déjà tourné. */
    public static long revokeFamily(UUID familyId, Instant when, String reason) {
        return update("revokedAt = ?1, revokedReason = ?2 where familyId = ?3 and revokedAt is null",
                when, reason, familyId);
    }
}
