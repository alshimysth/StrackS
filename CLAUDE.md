# StrackS — monorepo

App mobile multi-sport (Phase 1 : course & marche). Package/groupId `com.stracks` (renommé
depuis SportTracker le 2026-07-17 — seuls les documents historiques gardent l'ancien nom).

| Dossier | Stack | Sous-CLAUDE.md |
|---|---|---|
| `backend/` | Java 21 / Quarkus 3.37 / PostgreSQL (JSONB) / Flyway | — (ce fichier fait foi) |
| `mobile/` | Expo SDK 54 / React Native (Expo Router) | `mobile/CLAUDE.md` → `AGENTS.md` |
| `deploy/` | docker-compose.prod.yml + `.env.example` pour le VPS | — (ce fichier fait foi) |
| `StrackDoc/` | Vault Obsidian, gitignoré, contexte projet approfondi | `StrackDoc/CLAUDE.md` |

Pour le contexte produit/architecture détaillé (modèle de données, pattern plugin, décisions
de pivot), consulter `StrackDoc/wiki/index.md` en premier — c'est le panneau de direction du
vault. Ne pas dupliquer ce contenu ici.

## Backend — conventions

- **Pattern plugin** : `core/` ne connaît aucun sport ; `sports/*` (running, walking) dépend
  de `core/`, jamais l'inverse, jamais d'un autre sport. Ajouter un sport = ajouter un package
  sous `sports/`, zéro fichier de `core/` modifié.
- **Modèle de données** : une seule table `activities` (champs communs + `metrics` JSONB
  propre à chaque sport, `schemaVersion`, lecture tolérante — jamais de migration SQL par
  sport) ; `track_points` en table dédiée pour les traces GPS.
- **API** : `/api/v1`, routes kebab-case pluriel, JSON camelCase, dates ISO 8601, erreurs
  RFC 7807, JWT Bearer partout sauf `/auth/*`, anti-IDOR systématique sur toute ressource
  appartenant à un utilisateur.
- Migrations Flyway dans `src/main/resources/db/migration` — jamais d'`ALTER TYPE` ni de
  migration spécifique à un sport (le `sport_type` est un TEXT validé par le registre
  applicatif, pas un ENUM SQL).
- ⚠️ **L'ORDRE DE FUSION DES MIGRATIONS EST CONTRAIGNANT.** `quarkus.flyway.migrate-at-start=true`
  et aucune clé `out-of-order` : Flyway **refuse** une migration de version inférieure à celle
  déjà appliquée. Or `backend-deploy` part sur chaque push vers `main` touchant `backend/**`.
  Deux branches portant `V(n)` et `V(n+1)` doivent donc être fusionnées **dans l'ordre croissant**,
  en attendant que le déploiement de la première aboutisse. Fusionner `V(n+1)` d'abord fait
  monter la production à `n+1`, puis refuser `V(n)` : **le backend ne démarre plus**. Ce n'est
  pas une dégradation, c'est une panne. Réserver les numéros à l'avance ne protège de rien —
  seul l'ordre de fusion le fait. Vérifier après coup avec
  `SELECT installed_rank, version, success FROM flyway_schema_history ORDER BY installed_rank`
  (`installed_rank` doit suivre `version`).

## Déploiement (`deploy/`)

- Prod sur un VPS unique, backend + PostgreSQL 18 en Docker Compose, derrière un **Traefik
  partagé** déjà en place sur le VPS (réseau externe `root_default`, certresolver
  `mytlschallenge`). Ne jamais publier de port sur l'hôte — Traefik route par le réseau
  partagé via labels.
- Images backend publiées sur GHCR (`ghcr.io/alshimysth/stracks-backend`), l'image reste
  **keyless** : les clés JWT sont montées en lecture seule au runtime
  (`MP_JWT_VERIFY_PUBLICKEY_LOCATION` / `SMALLRYE_JWT_SIGN_KEY_LOCATION`), jamais copiées
  dans l'image. Ces locations exigent le préfixe `file:` (SmallRye les résout comme des URL).
- PostgreSQL 18+ : monter le volume sur `/var/lib/postgresql` (parent), pas sur
  `.../postgresql/data` — sinon l'image refuse de démarrer.
- **Ne jamais committer** `.env` réel ni les `*.pem` — `deploy/.env.example` documente les
  variables attendues et la procédure de génération des clés (permissions UID 185).
- CI/CD dans `.github/workflows/` : `backend-ci` (tests), `backend-deploy` (test → build
  GHCR → SSH deploy VPS, déclenché sur push `main` touchant `backend/**` ou `deploy/**`),
  `mobile-ci`.

Détails de conception du pipeline : `StrackDoc/wiki/Intelligence/CICD-GitHub-Actions-Hostinger.md`.

## Suivi des tickets (GitHub)

Le backlog d'exécution vit sur **`alshimysth/StrackS`**. Le vault `StrackDoc/` porte la
**conception** (PRD, architecture, décisions), GitHub porte l'**avancement** — ne jamais
dupliquer l'un dans l'autre.

Structure : label `epic` sur les issues parentes (#8 à #14), un label `epic:*` par thème,
`story` sur les enfants, `long-terme` pour les idées hors roadmap engagée ; milestones =
jalons (`M3`, `M4`, `M5`, `Phase 2`). Chaque epic liste ses stories en checklist markdown.

> ⚠️ **Plusieurs sessions travaillent en parallèle sur ce repo.** Avant de modifier quoi que
> ce soit, lire **l'issue #48** (`gh issue view 48`) : elle répartit le travail en lots aux
> territoires de fichiers disjoints et **réserve les numéros de migration Flyway** (V4
> préférences, V5 refresh tokens, V6 titre d'activité). Deux sessions qui créent chacune un
> `V4__` se bloquent mutuellement — Flyway échoue en dur sur un doublon de version. Si ta
> tâche déborde du territoire de ton lot, arrête-toi et signale-le plutôt que d'empiéter.

**Toute intervention liée à un ticket doit laisser une trace dans le ticket** — sinon l'état
réel du projet n'existe nulle part :

- **Avant** : `gh issue view <n>` pour relire le contexte et la Definition of Done.
- **Après** : `gh issue comment <n>` avec ce qui a été fait, les fichiers touchés et ce qui
  reste. Un commentaire factuel, pas un résumé de conversation.
- **Cocher** l'item correspondant dans la checklist de l'epic parent.
- **Fermer** (`gh issue close`) uniquement quand la DoD écrite dans le ticket est réellement
  satisfaite. Sinon, commenter ce qui manque et laisser ouvert.
- **Référencer** le ticket dans le message de commit : `refs #12`, ou `closes #12` si le
  commit clôt la DoD.

**Si le travail révèle quelque chose que ne couvre aucun ticket**, créer le ticket plutôt que
de le traiter silencieusement — avec le `epic:*` et le milestone qui conviennent, et l'ajouter
à la checklist de son epic. Vérifier l'absence de doublon avant création
(`gh issue list --search "..."`).
