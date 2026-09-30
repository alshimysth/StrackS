package com.stracks.core.mail;

/**
 * Sending of transactional emails (#74, #75).
 *
 * <p><b>The provider isn't chosen yet</b>: it's a human decision, which commits money and
 * the processing of personal data (users' addresses). The core therefore only depends on
 * this interface; the shipped implementation ({@link LoggingEmailSender}) only logs.
 *
 * <p>Plugging in a provider = supplying an {@code @ApplicationScoped} bean implementing
 * this interface: it automatically replaces {@link LoggingEmailSender}, marked
 * {@code @DefaultBean}. No caller changes.
 *
 * <p>Contract: never throw to the caller on a delivery failure. A lost email must neither
 * fail a registration nor, above all, reveal through an error that an address has an
 * account.
 */
public interface EmailSender {

    void send(EmailMessage message);
}
