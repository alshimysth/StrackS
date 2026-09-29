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
 * Backend error monitoring (lot 5) with Sentry, **inactive as long as {@code SENTRY_DSN}
 * isn't provided**. No account is created by the code: plugging in the service is a human
 * decision (runbook: {@code docs/release/RUNBOOK.md}).
 *
 * <p>What is sent: ERROR-level logs, including the unhandled exceptions that produce a 500.
 * Nothing else: no performance traces, no breadcrumbs below WARN.
 *
 * <p>What isn't sent: any personal data. {@code sendDefaultPii} is off, and the user and
 * the HTTP request are removed from every event. Backend logs already contain no
 * location, password or code (codes are masked by {@code LoggingEmailSender} in prod).
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
        Logger.getLogger(SentryMonitoring.class.getName()).info("Sentry monitoring active");
    }

    /** Removes anything that could identify a person. Exposed for tests. */
    static SentryEvent strip(SentryEvent event) {
        event.setUser(null);
        event.setRequest(null);
        event.setServerName(null);
        return event;
    }
}
