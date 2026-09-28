package com.stracks.core.mail;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Alternative;

/**
 * Transport de test : garde les emails en mémoire pour que les tests lisent les codes.
 * Sélectionné d'office dans toutes les suites {@code @QuarkusTest} (alternative prioritaire).
 */
@Alternative
@Priority(1)
@ApplicationScoped
public class CapturingEmailSender implements EmailSender {

    private final List<EmailMessage> sent = new CopyOnWriteArrayList<>();

    @Override
    public void send(EmailMessage message) {
        sent.add(message);
    }

    public List<EmailMessage> sentTo(String address) {
        return sent.stream().filter(m -> m.to().equalsIgnoreCase(address)).toList();
    }

    /** Dernier code reçu par cette adresse. */
    public Optional<String> lastCodeFor(String address) {
        List<EmailMessage> mine = sentTo(address);
        for (int i = mine.size() - 1; i >= 0; i--) {
            if (mine.get(i).secret() != null) {
                return Optional.of(mine.get(i).secret());
            }
        }
        return Optional.empty();
    }
}
