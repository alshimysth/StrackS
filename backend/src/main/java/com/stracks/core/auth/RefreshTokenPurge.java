package com.stracks.core.auth;

import java.time.Duration;
import java.time.Instant;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Purge des refresh tokens (#50). Chaque rotation ajoute une ligne ; à un renouvellement
 * toutes les 15 min (#49), un utilisateur actif en produit une centaine par jour.
 *
 * <p>Ne sont supprimés que les jetons <b>expirés depuis plus de</b>
 * {@code retention-days}. Un jeton encore valide n'est jamais touché, révoqué ou non :
 * la chaîne {@code replaced_by} d'une famille vivante sert la détection de rejeu. Au-delà
 * de l'expiration, la rétention garde de quoi analyser un incident.
 *
 * <p>Porté par le backend plutôt que par une tâche de déploiement : c'est une règle métier
 * de {@code core/auth}, elle doit tourner partout où le backend tourne, tests compris.
 */
@ApplicationScoped
public class RefreshTokenPurge {

    private static final Logger LOG = Logger.getLogger(RefreshTokenPurge.class);

    @ConfigProperty(name = "stracks.auth.refresh-purge.retention-days", defaultValue = "30")
    int retentionDays;

    @Scheduled(every = "{stracks.auth.refresh-purge.every}", delayed = "5m", identity = "refresh-token-purge")
    void scheduled() {
        purge(Instant.now());
    }

    /** @return le nombre de jetons supprimés */
    @Transactional
    public long purge(Instant now) {
        Instant before = now.minus(Duration.ofDays(retentionDays));
        long deleted = RefreshTokenEntity.deleteExpiredBefore(before);
        LOG.infof("Purge des refresh tokens : %d supprimé(s), expirés avant %s", deleted, before);
        return deleted;
    }
}
