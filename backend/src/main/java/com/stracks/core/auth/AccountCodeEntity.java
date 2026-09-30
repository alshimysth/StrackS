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

/** One-time code sent by email (migration V7). Only stores the BCrypt hash. */
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

    /** The code still open for this purpose, locked: two simultaneous attempts are serialized. */
    static Optional<AccountCodeEntity> findActiveForUpdate(UUID userId, String purpose) {
        return find("userId = ?1 and purpose = ?2 and consumedAt is null order by createdAt desc",
                userId, purpose)
                .withLock(LockModeType.PESSIMISTIC_WRITE)
                .firstResultOptional();
    }

    /**
     * Closes all of a user's open codes, whatever the purpose. Called when a secret changes
     * (CodeRabbit review, PR #78): an action started from the old session, typically a
     * pending email change, must not survive the account being taken back.
     */
    static long closeAllActive(UUID userId, Instant when) {
        return update("consumedAt = ?1 where userId = ?2 and consumedAt is null", when, userId);
    }

    /** A single open code per purpose: issuing a new one closes the previous ones. */
    static long closeActive(UUID userId, String purpose, Instant when) {
        return update("consumedAt = ?1 where userId = ?2 and purpose = ?3 and consumedAt is null",
                when, userId, purpose);
    }

    /** Purge (#87): only touches codes that expired before {@code before}. */
    static long deleteExpiredBefore(Instant before) {
        return delete("expiresAt < ?1", before);
    }
}
