> ⚠️ **BROUILLON — NON VALIDÉ JURIDIQUEMENT.** Rédigé par une session de code le
> 2026-09-29 à partir de ce que fait réellement le code (`main` après le lot 5). À faire
> relire par un juriste avant toute publication. Chaque `[À COMPLÉTER]` est une information
> que le code ne peut pas donner.

# Politique de confidentialité de StrackS

*Dernière mise à jour : [À COMPLÉTER : date de publication]*

## 1. Qui est responsable de vos données

L'application StrackS est éditée par **[À COMPLÉTER : nom ou raison sociale, forme
juridique, adresse]**, responsable du traitement au sens du RGPD.

Contact pour toute question sur vos données : **[À COMPLÉTER : adresse email dédiée]**.

## 2. Ce que nous collectons, et pourquoi

| Donnée | Quand | Pourquoi | Base légale |
|---|---|---|---|
| Adresse email | À l'inscription | Vous identifier, vous connecter, réinitialiser votre mot de passe | Exécution du contrat |
| Mot de passe | À l'inscription | Sécuriser votre compte — **jamais stocké en clair** (empreinte BCrypt) | Exécution du contrat |
| Nom affiché (facultatif) | Si vous le renseignez | Personnaliser l'app | Exécution du contrat |
| **Position GPS** | **Uniquement pendant une séance que vous avez démarrée** | Calculer distance, allure et dénivelé ; tracer votre parcours | Exécution du contrat |
| Données de séance | À chaque séance | Historique, statistiques, records, objectifs | Exécution du contrat |
| Poids (facultatif) | Si vous le renseignez | Estimer les calories de vos séances ; sans lui, aucune calorie n'est calculée | Consentement (vous le saisissez vous-même et pouvez le retirer à tout moment) |
| Préférences | Quand vous les réglez | Unités, thème, objectifs, précision GPS, zones de confidentialité | Exécution du contrat |

**Nous ne collectons pas** : taille, date de naissance, sexe, fréquence cardiaque, contacts,
photos, identifiant publicitaire. Nous ne suivons pas votre position en dehors des séances.

### La position en arrière-plan

Si vous l'autorisez (option « Toujours » de votre téléphone), StrackS continue d'enregistrer
votre parcours **pendant une séance** quand l'écran est verrouillé. L'enregistrement s'arrête
dès que vous terminez la séance. Vous pouvez refuser : la séance s'arrêtera alors si l'écran
s'éteint.

### Zones de confidentialité

Vous pouvez déclarer des zones — votre domicile, par exemple — autour desquelles votre tracé
n'est **pas affiché** sur les cartes. Le tracé reste enregistré en entier : il sert au calcul
de la distance, et figure dans votre export. Le centre de chaque zone est volontairement
décalé de votre position réelle, qui n'est pas enregistrée.

## 3. Ce que nous ne faisons pas

- **Aucune publicité**, aucun profilage publicitaire, aucune revente de données.
- **Aucun partage** de vos séances avec d'autres utilisateurs : l'app n'a pas de fonction
  sociale.
- Aucune décision automatisée produisant des effets juridiques à votre égard.

## 4. Où vont vos données (sous-traitants)

| Destinataire | Rôle | Localisation |
|---|---|---|
| Hostinger | Hébergement du serveur et de la base de données | [À COMPLÉTER : pays du centre de données du VPS] |
| Cloudflare (R2) | Stockage des sauvegardes, **chiffrées avant envoi** : Cloudflare ne peut pas les lire | [À COMPLÉTER : emplacement choisi pour le bucket, Europe recommandé] |
| [À COMPLÉTER : fournisseur d'email, ticket #77] | Envoi des codes de réinitialisation et de vérification | [À COMPLÉTER] |
| Sentry (si activé) | Rapports d'erreurs techniques, **débarrassés de toute donnée personnelle** : ni email, ni position, ni identifiant | [À COMPLÉTER : région UE recommandée] |
| Expo (EAS Update) | Distribution des mises à jour de l'application ; votre adresse IP est vue lors du téléchargement | [À COMPLÉTER : vérifier la localisation] |
| Apple (iOS) / Google (Android) | Affichage des fonds de carte : la **zone consultée** est transmise pour charger les tuiles | [À COMPLÉTER] |

[À COMPLÉTER : pour chaque sous-traitant hors de l'UE, mentionner les garanties de transfert,
par exemple les clauses contractuelles types.]

## 5. Combien de temps nous les gardons

| Donnée | Durée |
|---|---|
| Compte, séances, tracés, préférences | Tant que votre compte existe. Supprimés immédiatement à la suppression du compte |
| Sessions de connexion (jetons) | 60 jours d'inactivité au plus, puis effacés dans les 30 jours suivant leur expiration |
| Codes envoyés par email | Valables 15 min à 24 h selon l'usage, effacés 7 jours après leur expiration |
| Sauvegardes | 7 sauvegardes quotidiennes et 4 hebdomadaires : après suppression d'un compte, ses données peuvent subsister **jusqu'à environ 29 jours** dans des sauvegardes chiffrées, puis disparaissent |
| Journaux techniques du serveur | [À COMPLÉTER : durée de conservation des journaux Docker et Traefik sur le VPS] |

## 6. Vos droits

Vous pouvez, **directement dans l'application** (onglet Profil) :
- **consulter et corriger** vos informations : nom, email, poids, préférences ;
- **exporter toutes vos données** dans un fichier JSON lisible par machine (droit à la
  portabilité), séances et tracés GPS compris ;
- **supprimer votre compte**, avec toutes vos séances et tous vos tracés (droit à
  l'effacement).

**Sans l'application** — si vous l'avez désinstallée, par exemple —, vous pouvez demander la
suppression de votre compte et de toutes vos données en écrivant à **[À COMPLÉTER : email
de contact]** depuis l'adresse de votre compte. Cette section sert aussi de page de demande
de suppression exigée par Google Play.

Pour tout autre droit (opposition, limitation) : même adresse. Vous pouvez aussi saisir la
CNIL (www.cnil.fr).

## 7. Sécurité

- Échanges chiffrés (HTTPS) ; mots de passe et codes stockés sous forme d'empreinte.
- Sessions courtes : le jeton d'accès expire au bout de 15 minutes ; changer de mot de passe
  déconnecte vos autres appareils.
- Nombre de tentatives de connexion limité.
- Sur votre téléphone, vos jetons sont conservés dans le stockage sécurisé du système. Le
  cache de l'historique est effacé à la déconnexion.

## 8. Âge minimum

[À COMPLÉTER : âge minimum retenu. En France, un mineur de moins de 15 ans ne peut consentir
seul au traitement de ses données dans le cadre d'un service en ligne ; à arbitrer avec le
juriste.]

## 9. Modifications

Nous vous informerons dans l'application de toute modification importante de cette
politique.
