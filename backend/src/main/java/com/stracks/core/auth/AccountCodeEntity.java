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

/** Code à usage unique envoyé par email (migration V7). Ne porte que l'empreinte BCrypt. */
@Entity
@Table(name = "account_codes")
public class AccountCodeEntity extends PanacheEntityBase {

    @Id
    public UUID id;

    @Column(name = "user_id", nullable = false)
    public UUID userId;

    @Column(nullable = false)
    public String purpose;

    @Column(name = "code_hash", nullable = false)
    public String codeHash;

    @Column(name = "target_email")
    public String targetEmail;

    @Column(nullable = false)
    public int attempts;

    @Column(name = "expires_at", nullable = false)
    public Instant expiresAt;

    @Column(name = "consumed_at")
    public Instant consumedAt;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    /** Le code encore ouvert pour ce motif, verrouillé : deux essais simultanés se sérialisent. */
    static Optional<AccountCodeEntity> findActiveForUpdate(UUID userId, String purpose) {
        return find("userId = ?1 and purpose = ?2 and consumedAt is null order by createdAt desc",
                userId, purpose)
                .withLock(LockModeType.PESSIMISTIC_WRITE)
                .firstResultOptional();
    }

    /**
     * Clôt tous les codes ouverts d'un utilisateur, tous motifs confondus. Appelé quand un
     * secret change (revue CodeRabbit, PR #78) : une action lancée depuis l'ancienne
     * session — un changement d'email en attente, typiquement — ne doit pas survivre à
     * la reprise en main du compte.
     */
    static long closeAllActive(UUID userId, Instant when) {
        return update("consumedAt = ?1 where userId = ?2 and consumedAt is null", when, userId);
    }

    /** Un seul code ouvert par motif : en émettre un nouveau clôt les précédents. */
    static long closeActive(UUID userId, String purpose, Instant when) {
        return update("consumedAt = ?1 where userId = ?2 and purpose = ?3 and consumedAt is null",
                when, userId, purpose);
    }
}
