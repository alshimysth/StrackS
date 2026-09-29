package com.stracks.core.mail;

import io.quarkus.arc.DefaultBean;
import io.quarkus.runtime.LaunchMode;
import jakarta.enterprise.context.ApplicationScoped;
import org.jboss.logging.Logger;

/**
 * Development implementation: the email is written to the log, nothing is sent.
 *
 * <p>In dev and test, the full message is logged: that's what lets you get a code without
 * a mailbox. <b>In prod, the secret is masked</b>: codes give control over an account, and
 * a log is read by far more people than a mailbox. As long as no provider is plugged in,
 * the features that send a code therefore don't work in production; that's intended, and
 * it's reported on every send.
 */
@DefaultBean
@ApplicationScoped
public class LoggingEmailSender implements EmailSender {

    private static final Logger LOG = Logger.getLogger(LoggingEmailSender.class);

    @Override
    public void send(EmailMessage message) {
        if (LaunchMode.current() == LaunchMode.NORMAL) {
            LOG.warnf("Email NOT sent (no provider configured): \"%s\" to %s",
                    message.subject(), mask(message.to()));
            return;
        }
        LOG.infof("Email (dev log) to %s: %s%n%s", message.to(), message.subject(), message.body());
    }

    /** {@code jean.dupont@exemple.fr} → {@code j***@exemple.fr}: enough to diagnose. */
    static String mask(String email) {
        int at = email.indexOf('@');
        if (at <= 1) {
            return "***" + (at >= 0 ? email.substring(at) : "");
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
