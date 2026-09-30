package com.stracks.core.auth;

import java.time.Instant;
import java.util.UUID;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/**
 * Family revocation in an independent transaction.
 *
 * <p>Rationale: replay detection revokes the family <em>then</em> rejects the request.
 * Since the rejection travels as an exception, the request's transaction is rolled back,
 * and would take the revocation with it, leaving the stolen token perfectly usable.
 * {@code REQUIRES_NEW} detaches the security write from the fate of the request.
 *
 * <p>A separate bean rather than a private method: an internal call on {@code this} would
 * bypass the CDI interceptor, and the annotation would have no effect.
 */
@ApplicationScoped
public class RefreshTokenRevoker {

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void revokeFamily(UUID familyId, Instant when, String reason) {
        RefreshTokenEntity.revokeFamily(familyId, when, reason);
    }
}
