package com.stracks.core.mail;

import io.quarkus.arc.DefaultBean;
import io.quarkus.runtime.LaunchMode;
import jakarta.enterprise.context.ApplicationScoped;
import org.jboss.logging.Logger;

/**
 * Implémentation de développement : l'email est écrit dans le journal, rien ne part.
 *
 * <p>En dev et en test, le message complet est journalisé — c'est ce qui permet de
 * récupérer un code sans boîte mail. <b>En prod, le secret est masqué</b> : les codes
 * donnent la main sur un compte, et un journal est lu par bien plus de monde qu'une
 * boîte mail. Tant qu'aucun fournisseur n'est branché, les fonctions qui envoient un
 * code ne fonctionnent donc pas en production — c'est voulu, et c'est signalé à
 * chaque envoi.
 */
@DefaultBean
@ApplicationScoped
public class LoggingEmailSender implements EmailSender {

    private static final Logger LOG = Logger.getLogger(LoggingEmailSender.class);

    @Override
    public void send(EmailMessage message) {
        if (LaunchMode.current() == LaunchMode.NORMAL) {
            LOG.warnf("Email NON envoyé (aucun fournisseur configuré) : « %s » à %s",
                    message.subject(), mask(message.to()));
            return;
        }
        LOG.infof("Email (journal de dev) à %s — %s%n%s", message.to(), message.subject(), message.body());
    }

    /** {@code jean.dupont@exemple.fr} → {@code j***@exemple.fr} : assez pour diagnostiquer. */
    static String mask(String email) {
        int at = email.indexOf('@');
        if (at <= 1) {
            return "***" + (at >= 0 ? email.substring(at) : "");
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
