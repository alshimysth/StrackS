package com.stracks.core.mail;

/**
 * A transactional email, in plain text.
 *
 * <p>{@code secret} is the sensitive part of the body (a one-time code): a transport that
 * logs must be able to mask it without parsing the text.
 */
public record EmailMessage(String to, String subject, String body, String secret) {
}
