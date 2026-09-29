package com.stracks.core.monitoring;

import io.sentry.SentryEvent;
import io.sentry.protocol.Request;
import io.sentry.protocol.User;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNull;

/** Aucun identifiant de personne ne part chez le tiers de monitoring. */
class SentryMonitoringTest {

    @Test
    void retire_utilisateur_requete_et_nom_de_machine() {
        SentryEvent event = new SentryEvent();
        User user = new User();
        user.setEmail("a@example.com");
        user.setIpAddress("1.2.3.4");
        event.setUser(user);
        Request request = new Request();
        request.setUrl("https://stracks.alshimysth.cloud/api/v1/auth/login");
        event.setRequest(request);
        event.setServerName("vps-prod");

        SentryEvent clean = SentryMonitoring.strip(event);

        assertNull(clean.getUser());
        assertNull(clean.getRequest());
        assertNull(clean.getServerName());
    }
}
