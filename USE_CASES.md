# StrackS — Cas d'utilisation (Phase 1)

> Version 1.1 (2026-09-29, `main` après le lot 4 de finition). Dérivés du PRD v2.0
> (`StrackDoc/raw/docs/PRD.md`).
> Statut : **les neuf cas sont implémentés et testés**, backend (`backend/src/test/`) et
> mobile (`mobile/src/**/__tests__/`). Ce qui reste n'est pas du code mais de la
> **validation sur appareil réel** : suivi en arrière-plan, batterie, calibration GPS
> (#15 à #19, #70, #81, #84). L'avancement fait foi sur GitHub, pas dans ce fichier.

Acteur principal : **l'athlète** (coureur / marcheur régulier, athlète hybride).
Préconditions générales : app installée ; les UC-2+ exigent une session active (JWT).

---

## UC-1 — Créer un compte

| | |
|---|---|
| **Déclencheur** | Premier lancement, « Créer un compte » |
| **Scénario nominal** | 1. L'athlète saisit email + mot de passe (≥ 8 car.) + nom affiché optionnel. 2. Le système crée le compte, retourne un JWT. 3. L'athlète arrive connecté sur l'accueil. |
| **Alternatives** | 2a. Email déjà pris → message « Un compte existe déjà avec cet email » (409). 2b. Mot de passe < 8 → erreur de saisie inline (400). |
| **Postcondition** | Compte créé, session persistée en stockage sécurisé. |
| **Implémenté par** | `POST /api/v1/auth/register` · écran `(auth)/register` · test `AuthResourceTest` |

## UC-2 — Se connecter / rester connecté

| | |
|---|---|
| **Déclencheur** | Lancement de l'app ou « Se connecter » |
| **Scénario nominal** | 1. Saisie email + mot de passe. 2. JWT retourné, session persistée. 3. Aux lancements suivants, la session est réhydratée sans re-saisie. |
| **Alternatives** | 2a. Identifiants invalides → « Email ou mot de passe incorrect » (401), sans révéler lequel. 2b. Trop d'essais → 429 avec délai d'attente (#72). 3a. JWT d'accès expiré (15 min, #49) → **renouvellement transparent** par refresh token rotatif (#44), sans retour à l'écran de connexion ; seule une session révoquée, ou restée inactive plus de 60 jours, y ramène (chaque renouvellement repart pour 60 jours). 3b. Mot de passe oublié → code à usage unique par email (#74). |
| **Implémenté par** | `POST /api/v1/auth/login·refresh·logout·password-resets` · `core/api/client.ts` · `use-auth-store` · tests `AuthResourceTest`, `RefreshTokenResourceTest`, `ShortLivedAccessTokenTest`, `AccountFlowTest`, `client.test.ts` |

## UC-3 — Gérer son profil et supprimer son compte

| | |
|---|---|
| **Scénario nominal** | Consultation et mise à jour du nom affiché ; préférences (unités, thème, objectifs, mode GPS, zones de confidentialité) ; poids pour les calories ; changement de mot de passe et d'email ; déconnexion. |
| **Variante effacement** | « Supprimer mon compte » → confirmation explicite → suppression du compte **et de toutes les activités et tracés** (cascade, droit à l'effacement RGPD). |
| **Variante portabilité** | « Exporter mes données » → document JSON complet, partagé puis effacé du téléphone (#76). |
| **Implémenté par** | `/api/v1/users/me` (+ `/preferences`, `/password`, `/email-changes`, `/export`) · écrans `(tabs)/profile`, `account/*` · tests `PreferencesResourceTest`, `AccountFlowTest`, `DataExportTest`, `profile-*.test.tsx` |

## UC-4 — Choisir un sport et démarrer une séance

| | |
|---|---|
| **Déclencheur** | Accueil → sélection du sport |
| **Scénario nominal** | 1. L'app affiche les sports depuis le **registre backend** (`GET /sport-types` : course à pied, marche). 2. L'athlète en choisit un. 3. Démarrage en ≤ 2 interactions : le système crée une activité `in_progress`. |
| **Alternatives** | 3a. Sport inconnu du backend (client obsolète) → 422. |
| **Règle d'extensibilité** | Un sport ajouté au backend + mobile apparaît ici **sans modifier cet écran** (test Epic 2 : plugin factice). |
| **Implémenté par** | `GET /api/v1/sport-types` · `POST /api/v1/activities` · écran `(tabs)/index` + `sports/registry.ts` |

## UC-5 — Tracker une séance en temps réel

| | |
|---|---|
| **Scénario nominal** | 1. Écran de tracking plein écran (thème sombre « plein soleil ») : carte + tracé live, durée, distance, allure instantanée et moyenne, D+/D-. 2. Tracking en arrière-plan (écran verrouillé). 3. Pause / reprise (les pauses sont exclues de la durée active). 4. Arrêt par **appui maintenu 1,5 s** (hold-to-finish). |
| **Exigences** | Métriques lisibles en < 0,5 s en mouvement ; démarrage ≤ 2 taps ; batterie ≤ 8 %/h. |
| **Implémenté par** | `core/session/` (moteur de séance, décompte #3, perte de signal #19), `core/gps/` (premier plan et arrière-plan #16, modes GPS #36) · `POST /activities/{id}/pause·resume·stop` · tests `use-session-store.test.ts`, `signal-loss.test.ts`, `metrics.parity.test.ts` |
| **À valider sur appareil** | Arrière-plan écran verrouillé (#16, #70), batterie ≤ 8 %/h (#18), calibration GPS sur traces réelles (#17). |

## UC-6 — Ne jamais perdre une séance (résilience hors ligne)

| | |
|---|---|
| **Scénario nominal** | 1. Pendant la séance, le tracé est bufferisé **localement sur disque** au fil de l'eau. 2. Perte réseau totale → l'enregistrement continue, aucune alerte anxiogène. 3. À l'arrêt (ou au retour du réseau), l'app crée/clôture l'activité et uploade le tracé par lots. |
| **Alternatives** | 2a. Kill de l'app → séance récupérée au relancement. 3a. Retry réseau → l'upload par lots est **idempotent** par (activité, seq) : aucun point dupliqué. |
| **Implémenté par** | Buffer SQLite `core/session/buffer.ts` (contrat partagé avec le buffer web, #52), récupération après kill `recover()`, envoi par lots `uploader.ts` · `POST /activities/{id}/track-points` idempotent · tests `buffer.test.ts`, `uploader.test.ts`, `use-session-store.test.ts` |

## UC-7 — Terminer et enregistrer une séance

| | |
|---|---|
| **Scénario nominal** | 1. Au stop, le client envoie fin + durée active + métriques client. 2. **Le serveur recalcule** les métriques finales depuis le tracé brut (distance haversine filtrée, D+/D- avec hystérésis, allure moyenne, splits/km — course ; vitesse moyenne — marche ; calories si le poids est connu, #33). 3. Écran de résumé : tracé complet (zones de confidentialité masquées, #37), métriques, titre et notes ; célébration s'il y a lieu (première séance, record #61, objectif #35). |
| **Implémenté par** | `POST /activities/{id}/stop` + plugins `RunningPlugin`/`WalkingPlugin` · écran `summary/[id]` · tests `ActivityFlowTest`, `GpsComputationsTest`, `summary.test.tsx` |

## UC-8 — Consulter, filtrer, éditer son historique

| | |
|---|---|
| **Scénario nominal** | 1. Liste chronologique paginée, filtrable par sport et période. 2. Détail : carte du tracé, métriques du sport, notes. 3. Édition des notes ; suppression avec confirmation. |
| **Implémenté par** | `GET /activities` (+filtres, pagination serveur) · `GET/PATCH/DELETE /activities/{id}` · `GET /activities/{id}/track-points` · onglet Historique (cache consultable hors ligne, #27), écran `activity/[id]` · tests `history.test.tsx`, `activity-detail.test.tsx` |

## UC-9 — Suivre sa progression (stats)

| | |
|---|---|
| **Scénario nominal** | 1. Agrégats semaine / mois / année et depuis toujours, par sport et totaux, comparés à la période précédente, avec graphique. 2. Chaque module de sport calcule ses propres stats (`computeStats`) et déclare ses records. 3. Objectifs hebdomadaires sur l'accueil. |
| **Implémenté par** | `GET /api/v1/stats/summary·timeline·records` · onglet Stats, profil · tests `StatsResourceTest`, `AllTimeStatsTest`, `PersonalRecordsTest`, `StatsPerformanceTest` (p95 17 ms, #28), `stats.test.tsx` |

---

## Cas limites transverses (contrats vérifiés par les tests)

- **Isolation stricte** : toute ressource d'un autre utilisateur répond **404** (jamais 403 — l'existence n'est pas révélée). Testé.
- **Transitions d'état** : pause sur une séance non démarrée, resume sans pause, double stop → **409**. Testé.
- **Sport inconnu** : création d'activité ou filtre stats sur un code hors registre → **422**. Testé.
- **Erreurs** : toutes les erreurs sont des RFC 7807 `application/problem+json`, messages en français.
