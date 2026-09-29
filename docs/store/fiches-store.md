> Brouillon de fiches store, rédigé le 2026-09-29 (lot 5 de finition). Les réponses aux
> questionnaires de confidentialité sont **déduites du code**, pas d'une intention : si le
> code change (fournisseur d'email, Sentry activé, nouvelle donnée collectée), elles doivent
> changer avec lui. À relire avant soumission, en même temps que `docs/legal/`.

# Fiches App Store et Google Play — StrackS

## Textes communs (français)

**Nom** : StrackS

**Sous-titre** (App Store, 30 caractères max) : `Course et marche, sans détour`

**Description courte** (Google Play, 80 caractères max) :
`Enregistre tes sorties course et marche par GPS et suis ta progression.`

**Description longue** :

> Lance ta séance en un geste, et StrackS s'occupe du reste.
>
> **Pendant l'effort**
> • Distance, allure ou vitesse, durée, dénivelé : lisibles d'un coup d'œil, même en plein soleil.
> • Carte de ton parcours en direct.
> • L'enregistrement continue téléphone en poche, écran verrouillé.
> • Pas de réseau ? Aucune importance : la séance est gardée sur ton téléphone et envoyée au retour de la connexion.
>
> **Après**
> • Résumé complet : tracé, allure au kilomètre, dénivelé, calories si tu renseignes ton poids.
> • Historique filtrable, statistiques par semaine, mois et année.
> • Records personnels et objectifs hebdomadaires, célébrés quand tu les atteins.
>
> **Ta vie privée**
> • Ta position n'est suivie que pendant une séance.
> • Masque ton tracé autour de chez toi avec les zones de confidentialité.
> • Exporte toutes tes données ou supprime ton compte depuis l'app.
> • Aucune publicité, aucune revente de données.

**Mots-clés** (App Store, 100 caractères max) :
`course,running,marche,gps,footing,jogging,allure,parcours,entraînement,séance,dénivelé,stats`

**Catégorie** : Santé et forme (App Store) · Santé et remise en forme (Google Play)

**URL de la politique de confidentialité** : [À COMPLÉTER : URL publique, voir le runbook §7]

**Contact support** : [À COMPLÉTER]

## Captures d'écran à produire

Tailles : iPhone 6,9" et 6,5" ; téléphone Android. À prendre sur un **dev build**, avec des
données de démonstration, **jamais un vrai tracé autour d'un vrai domicile**.

1. Séance en cours (thème sombre) : carte, allure, distance
2. Résumé de fin de séance avec la célébration de record
3. Historique
4. Statistiques, graphique du mois
5. Profil : zones de confidentialité et export

## App Store — « Confidentialité de l'app » (App Privacy)

Suivi (*tracking*) au sens d'Apple : **Non**. Aucune donnée n'est croisée avec celles d'autres
entreprises, et aucune n'est utilisée à des fins publicitaires.

| Type de donnée Apple | Collectée | Liée à l'utilisateur | Finalité |
|---|---|---|---|
| Coordonnées → Adresse email | Oui | Oui | Fonctionnalité de l'app (compte) |
| Coordonnées → Nom | Oui, facultatif (nom affiché) | Oui | Fonctionnalité de l'app |
| Position → Position précise | Oui, pendant les séances | Oui | Fonctionnalité de l'app |
| Santé et forme → Forme physique | Oui (séances) | Oui | Fonctionnalité de l'app |
| Santé et forme → Santé | Oui, facultatif (poids) | Oui | Fonctionnalité de l'app (calories) |
| Contenu utilisateur → Autre | Oui (titres et notes de séance) | Oui | Fonctionnalité de l'app |
| Identifiants → Identifiant utilisateur | Oui (identifiant de compte interne) | Oui | Fonctionnalité de l'app |
| Diagnostics → Données de plantage | **Seulement si Sentry est activé** | Non (identifiants retirés) | Analyse |

**Notes pour la revue Apple** : un compte de démonstration ([À COMPLÉTER]), et une phrase sur
l'arrière-plan : « La localisation en arrière-plan ne sert qu'à poursuivre l'enregistrement
d'une séance démarrée par l'utilisateur, écran verrouillé. Elle s'arrête à la fin de la
séance. »

## Google Play — « Sécurité des données » (Data safety)

- Données chiffrées en transit : **Oui**.
- L'utilisateur peut demander la suppression de ses données : **Oui**, dans l'app (Profil →
  Supprimer mon compte).
- Données partagées avec des tiers : **Non**. Les sous-traitants qui traitent pour notre
  compte (hébergement, sauvegardes, email) ne constituent pas un « partage » au sens de
  Google. **À confirmer** au moment de remplir le formulaire.

| Catégorie Google | Collectée | Facultative | Finalité |
|---|---|---|---|
| Position → Position exacte | Oui | Non (cœur de l'app) | Fonctionnalité de l'app |
| Informations personnelles → Adresse email | Oui | Non | Gestion du compte |
| Informations personnelles → Nom | Oui | Oui | Personnalisation |
| Santé et remise en forme → Informations sur la remise en forme | Oui | Non | Fonctionnalité de l'app |
| Santé et remise en forme → Informations de santé | Oui (poids) | Oui | Fonctionnalité de l'app |
| Informations et performances de l'app → Journaux de plantage | Seulement si Sentry est activé | — | Analyse |

**Déclaration « localisation en arrière-plan »** (Play Console → Contenu de l'application),
**obligatoire** :
- Fonctionnalité : « Enregistrer le parcours d'une séance de course ou de marche démarrée
  par l'utilisateur lorsque l'écran est verrouillé. »
- **Vidéo requise** : filmer l'onboarding (explication, puis demande de permission), puis le
  démarrage d'une séance, la demande « Toujours » et l'écran verrouillé pendant que la
  distance progresse.
