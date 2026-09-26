package com.stracks.core.mail;

/**
 * Un email transactionnel, en texte brut.
 *
 * <p>{@code secret} est la partie sensible du corps (un code à usage unique) : un
 * transport qui journalise doit pouvoir la masquer sans analyser le texte.
 */
public record EmailMessage(String to, String subject, String body, String secret) {
}
