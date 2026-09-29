package com.stracks.core.auth;

import java.time.Duration;
import java.time.Instant;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Purge des codes à usage unique (#87). Un code expiré ne sert plus à rien, mais sa ligne
 * garde l'identifiant de l'utilisateur et, pour un changement d'email, la nouvelle adresse
 * demandée en clair : la conserver indéfiniment contredirait la minimisation des données.
 *
 * <p>Ne supprime que les codes expirés depuis plus de {@code retention-days} — un code
 * encore utilisable n'est jamais touché ; la marge garde de quoi analyser un incident.
 */
@ApplicationScoped
public class AccountCodePurge {

    private static final Logger LOG = Logger.getLogger(AccountCodePurge.class);

    @ConfigProperty(name = "stracks.account.code.purge-retention-days", defaultValue = "7")
    int retentionDays;

    @Scheduled(every = "{stracks.account.code.purge-every}", delayed = "10m", identity = "account-code-purge")
    void scheduled() {
        purge(Instant.now());
    }

    /** @return le nombre de codes supprimés */
    @Transactional
    public long purge(Instant now) {
        Instant before = now.minus(Duration.ofDays(retentionDays));
        long deleted = AccountCodeEntity.deleteExpiredBefore(before);
        LOG.infof("Purge des codes de compte : %d supprimé(s), expirés avant %s", deleted, before);
        return deleted;
    }
}
