package com.stracks.core.monitoring;

import io.sentry.SentryEvent;
import io.sentry.protocol.Request;
import io.sentry.protocol.User;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNull;

/** No personal identifier is sent to the monitoring third party. */
class SentryMonitoringTest {

    @Test
    void strips_user_request_and_server_name() {
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
