package com.stracks.core.auth;

import java.time.Instant;
import java.util.UUID;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/**
 * Révocation de famille en transaction indépendante.
 *
 * <p>Raison d'être : la détection de rejeu révoque la famille <em>puis</em> refuse la
 * requête. Comme le refus voyage en exception, la transaction de la requête est annulée —
 * et emporterait la révocation avec elle, laissant le jeton volé parfaitement utilisable.
 * {@code REQUIRES_NEW} détache l'écriture de sécurité du sort de la requête.
 *
 * <p>Bean distinct et non méthode privée : un appel interne à {@code this} court-circuiterait
 * l'intercepteur CDI, et l'annotation n'aurait aucun effet.
 */
@ApplicationScoped
public class RefreshTokenRevoker {

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void revokeFamily(UUID familyId, Instant when, String reason) {
        RefreshTokenEntity.revokeFamily(familyId, when, reason);
    }
}
