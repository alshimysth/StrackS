package com.stracks.core.monitoring;

import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.LogManager;
import java.util.logging.Logger;

import io.quarkus.runtime.StartupEvent;
import io.sentry.Sentry;
import io.sentry.SentryEvent;
import io.sentry.jul.SentryHandler;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Monitoring des erreurs backend (lot 5) — Sentry, **inactif tant que {@code SENTRY_DSN}
 * n'est pas fourni**. Aucun compte n'est créé par le code : brancher le service est une
 * décision humaine (runbook : {@code docs/release/RUNBOOK.md}).
 *
 * <p>Ce qui part : les journaux de niveau ERROR — dont les exceptions non gérées qui
 * produisent un 500. Rien d'autre : pas de traces de performance, pas de fil d'Ariane
 * sous WARN.
 *
 * <p>Ce qui ne part pas : aucune donnée personnelle. {@code sendDefaultPii} est coupé,
 * l'utilisateur et la requête HTTP sont retirés de chaque événement. Les journaux du
 * backend ne contiennent déjà ni position, ni mot de passe, ni code (les codes sont
 * masqués par {@code LoggingEmailSender} en prod).
 */
@ApplicationScoped
public class SentryMonitoring {

    @ConfigProperty(name = "stracks.sentry.dsn")
    Optional<String> dsn;

    @ConfigProperty(name = "stracks.sentry.environment", defaultValue = "production")
    String environment;

    void onStart(@Observes StartupEvent event) {
        if (dsn.isEmpty() || dsn.get().isBlank()) {
            return;
        }
        Sentry.init(options -> {
            options.setDsn(dsn.get());
            options.setEnvironment(environment);
            options.setSendDefaultPii(false);
            options.setTracesSampleRate(0.0);
            options.setBeforeSend((sentryEvent, hint) -> strip(sentryEvent));
        });
        SentryHandler handler = new SentryHandler();
        handler.setMinimumEventLevel(Level.SEVERE);
        handler.setMinimumBreadcrumbLevel(Level.WARNING);
        Logger root = LogManager.getLogManager().getLogger("");
        root.addHandler(handler);
        Logger.getLogger(SentryMonitoring.class.getName()).info("Monitoring Sentry actif");
    }

    /** Retire ce qui pourrait identifier une personne. Exposé pour les tests. */
    static SentryEvent strip(SentryEvent event) {
        event.setUser(null);
        event.setRequest(null);
        event.setServerName(null);
        return event;
    }
}
