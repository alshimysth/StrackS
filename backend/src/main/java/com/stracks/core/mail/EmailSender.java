package com.stracks.core.mail;

/**
 * Envoi d'emails transactionnels (#74, #75).
 *
 * <p><b>Le fournisseur n'est pas choisi</b> — c'est une décision humaine, qui engage de
 * l'argent et le traitement de données personnelles (adresses des utilisateurs). Le
 * socle ne dépend donc que de cette interface ; l'implémentation livrée
 * ({@link LoggingEmailSender}) se contente de journaliser.
 *
 * <p>Brancher un fournisseur = fournir un bean {@code @ApplicationScoped} qui implémente
 * cette interface : il remplace automatiquement {@link LoggingEmailSender}, marqué
 * {@code @DefaultBean}. Aucun appelant ne change.
 *
 * <p>Contrat : ne jamais lever d'exception vers l'appelant pour un échec de livraison. Un
 * email perdu ne doit ni faire échouer une inscription, ni — surtout — révéler par une
 * erreur qu'une adresse a un compte.
 */
public interface EmailSender {

    void send(EmailMessage message);
}
