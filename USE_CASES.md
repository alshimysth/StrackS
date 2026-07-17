# StrackS — Cas d'utilisation (Phase 1)

> Version 1.0 (2026-07-13). Dérivés du PRD v2.0 (`StrackDoc/raw/docs/PRD.md`).
> Statut : **UC-1 à UC-4 et UC-9 implémentés et testés côté backend** (voir
> `backend/src/test/`) ; UC-5 à UC-8 attendent les Epics 3-5 côté mobile.

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
| **Alternatives** | 2a. Identifiants invalides → « Email ou mot de passe incorrect » (401), sans révéler lequel. 3a. Token expiré → retour automatique à l'écran de connexion. |
| **Implémenté par** | `POST /api/v1/auth/login` · `use-auth-store` (hydratation SecureStore) · garde de routes |

## UC-3 — Gérer son profil et supprimer son compte

| | |
|---|---|
| **Scénario nominal** | Consultation et mise à jour du nom affiché ; déconnexion. |
| **Variante effacement** | « Supprimer mon compte » → confirmation explicite → suppression du compte **et de toutes les activités et tracés** (cascade, droit à l'effacement RGPD). |
| **Implémenté par** | `GET/PATCH/DELETE /api/v1/users/me` · écran `(tabs)/profile` |

## UC-4 — Choisir un sport et démarrer une séance

| | |
|---|---|
| **Déclencheur** | Accueil → sélection du sport |
| **Scénario nominal** | 1. L'app affiche les sports depuis le **registre backend** (`GET /sport-types` : course à pied, marche). 2. L'athlète en choisit un. 3. Démarrage en ≤ 2 interactions : le système crée une activité `in_progress`. |
| **Alternatives** | 3a. Sport inconnu du backend (client obsolète) → 422. |
| **Règle d'extensibilité** | Un sport ajouté au backend + mobile apparaît ici **sans modifier cet écran** (test Epic 2 : plugin factice). |
| **Implémenté par** | `GET /api/v1/sport-types` · `POST /api/v1/activities` · écran `(tabs)/index` + `sports/registry.ts` |

## UC-5 — Tracker une séance en temps réel *(Epic 3/4 — à venir côté mobile)*

| | |
|---|---|
| **Scénario nominal** | 1. Écran de tracking plein écran (thème sombre « plein soleil ») : carte + tracé live, durée, distance, allure instantanée et moyenne, D+/D-. 2. Tracking en arrière-plan (écran verrouillé). 3. Pause / reprise (les pauses sont exclues de la durée active). 4. Arrêt par **appui maintenu 1,5 s** (hold-to-finish). |
| **Exigences** | Métriques lisibles en < 0,5 s en mouvement ; démarrage ≤ 2 taps ; batterie ≤ 8 %/h. |
| **Backend prêt** | `POST /activities/{id}/pause·resume·stop` (transitions validées, 409 sinon) |

## UC-6 — Ne jamais perdre une séance (résilience hors ligne)

| | |
|---|---|
| **Scénario nominal** | 1. Pendant la séance, le tracé est bufferisé **localement sur disque** au fil de l'eau. 2. Perte réseau totale → l'enregistrement continue, aucune alerte anxiogène. 3. À l'arrêt (ou au retour du réseau), l'app crée/clôture l'activité et uploade le tracé par lots. |
| **Alternatives** | 2a. Kill de l'app → séance récupérée au relancement. 3a. Retry réseau → l'upload par lots est **idempotent** par (activité, seq) : aucun point dupliqué. |
| **Backend prêt** | Création a posteriori acceptée + `POST /activities/{id}/track-points` idempotent (testé : rejeu d'un lot = 0 insertion) |

## UC-7 — Terminer et enregistrer une séance

| | |
|---|---|
| **Scénario nominal** | 1. Au stop, le client envoie fin + durée active + métriques client. 2. **Le serveur recalcule** les métriques finales depuis le tracé brut (distance haversine filtrée, D+/D- avec hystérésis, allure moyenne, splits/km — course ; vitesse moyenne — marche). 3. Écran de résumé : tracé complet, métriques, notes libres. |
| **Implémenté par** | `POST /activities/{id}/stop` + plugins `RunningPlugin`/`WalkingPlugin` · tests `ActivityFlowTest`, `GpsComputationsTest` |

## UC-8 — Consulter, filtrer, éditer son historique *(écrans Epic 5)*

| | |
|---|---|
| **Scénario nominal** | 1. Liste chronologique paginée, filtrable par sport et période. 2. Détail : carte du tracé, métriques du sport, notes. 3. Édition des notes ; suppression avec confirmation. |
| **Implémenté par** | `GET /activities` (+filtres) · `GET/PATCH/DELETE /activities/{id}` · `GET /activities/{id}/track-points` · onglet Historique (v1 : liste) |

## UC-9 — Suivre sa progression (stats)

| | |
|---|---|
| **Scénario nominal** | 1. Agrégats semaine / mois, par sport et totaux : séances, durée, distance, D+ cumulés. 2. Chaque module de sport calcule ses propres stats (`computeStats`). |
| **Implémenté par** | `GET /api/v1/stats/summary?period=week\|month&sport=` · testé dans `ActivityFlowTest` |

---

## Cas limites transverses (contrats vérifiés par les tests)

- **Isolation stricte** : toute ressource d'un autre utilisateur répond **404** (jamais 403 — l'existence n'est pas révélée). Testé.
- **Transitions d'état** : pause sur une séance non démarrée, resume sans pause, double stop → **409**. Testé.
- **Sport inconnu** : création d'activité ou filtre stats sur un code hors registre → **422**. Testé.
- **Erreurs** : toutes les erreurs sont des RFC 7807 `application/problem+json`, messages en français.
