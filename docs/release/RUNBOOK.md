# StrackS — runbook de mise en production

Tout ce qu'une session de code **ne peut pas faire** : créer des comptes, se connecter au VPS,
signer une build, publier, valider un texte juridique, tester sur un vrai téléphone. Chaque
section donne les commandes exactes, dans l'ordre. Rien de ce qui suit n'a été exécuté par la
session qui l'a écrit (lot 5 de finition, 2026-09-29) ; ce qui a été vérifié ailleurs est
signalé.

**Ordre recommandé** — les sauvegardes d'abord : la production tourne sans aucune depuis
son premier jour.

1. [Vérifier Flyway en production](#1-vérifier-flyway-en-production) — 5 min
2. [Activer les sauvegardes](#2-activer-les-sauvegardes-45) (#45) — 1 h
3. [Initialiser EAS et les mises à jour OTA](#3-initialiser-eas-et-les-mises-à-jour-ota) — 30 min
4. [Clé Google Maps](#4-clé-google-maps-86) (#86) — 20 min
5. [Monitoring Sentry](#5-monitoring-sentry) — 30 min
6. [Fournisseur d'email](#6-fournisseur-demail-77) (#77)
7. [Textes juridiques](#7-textes-juridiques)
8. [Recette sur appareil](#8-recette-sur-appareil)
9. [Publication sur les stores](#9-publication-sur-les-stores)

---

## 1. Vérifier Flyway en production

En attente depuis le 2026-08-21 : `installed_rank` doit suivre `version`. Une migration
appliquée hors ordre serait le signe d'une fusion dans le désordre (voir `CLAUDE.md`).

```bash
ssh root@<VPS> 'docker exec stracks-postgres psql -U stracks -d stracks -c \
  "SELECT installed_rank, version, success FROM flyway_schema_history ORDER BY installed_rank"'
```

Attendu : versions 1 à 7 dans l'ordre, toutes à `t`. Le lot 5 n'ajoute aucune migration.

## 2. Activer les sauvegardes (#45)

Mécanisme livré par le lot 5 : `pg_dump`, puis vérification de l'archive, chiffrement GPG
**asymétrique** et envoi vers un stockage S3 hors du VPS. Rétention : 7 quotidiens et 4
hebdomadaires. Le service `backup` est éteint tant que `COMPOSE_PROFILES=backup` n'est pas
posé dans `.env`.

**Déjà vérifié en local** (`deploy/backup/test/run-test.sh`), avec les scripts de production
et MinIO à la place de R2 :
- une base de 50 comptes, 2 000 activités et 600 000 points GPS a été sauvegardée, chiffrée,
  envoyée, puis restaurée dans une base vide **en 1 s** ;
- les comptages sont identiques ;
- un dump sans les tables de l'application est refusé.

**Ce qui n'a pas été fait** : tout ce qui touche au VPS et à R2.

### 2.1 Créer le stockage (Cloudflare R2, recommandé au lot A)

1. Tableau de bord Cloudflare → R2 → *Create bucket* : `stracks-backups`, emplacement
   **Europe** si proposé.
2. R2 → *Manage R2 API Tokens* → *Create API token*, avec la permission *Object Read & Write*
   **limitée à ce bucket**. Noter l'Access Key ID, le Secret Access Key et l'endpoint
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

### 2.2 Générer la paire de clés GPG — sur TON poste, jamais sur le VPS

```bash
gpg --quick-gen-key "StrackS backups <ton-email>" rsa4096 encr never
gpg --armor --export "StrackS backups" > backup-public.asc
gpg --armor --export-secret-keys "StrackS backups" > backup-private.asc   # à mettre en lieu sûr
```

⚠️ **La clé privée est la seule façon de relire une sauvegarde.** Garde-la dans un
gestionnaire de mots de passe **et** sur un support hors ligne. Perdue, toutes les
sauvegardes deviennent illisibles.

### 2.3 Configurer le VPS

Les scripts `backup/backup.sh` et `backup/entrypoint.sh` sont déposés dans `/root/stracks`
par le workflow de déploiement, à la fusion.

```bash
scp backup-public.asc root@<VPS>:/root/stracks/backup/keys/backup-public.asc
ssh root@<VPS>
cd /root/stracks
chmod 644 backup/keys/backup-public.asc
# Compléter .env (modèle : deploy/.env.example) :
#   BACKUP_BUCKET=stracks-backups
#   BACKUP_S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
#   BACKUP_S3_ACCESS_KEY_ID=...        BACKUP_S3_SECRET_ACCESS_KEY=...
#   BACKUP_PING_URL=https://hc-ping.com/<uuid>   # optionnel, fortement conseillé
#   COMPOSE_PROFILES=backup
docker compose -f docker-compose.prod.yml run --rm -e BACKUP_RUN_ONCE=true backup   # 1re sauvegarde, tout de suite
docker compose -f docker-compose.prod.yml up -d backup                              # puis chaque jour à 03:15 UTC
docker logs stracks-backup --tail 20
```

Attendu : `[backup] OK : stracks-<date>.dump.gpg (… octets chiffrés)`. **Le pas de
surveillance est conseillé** : une sauvegarde qui échoue en silence est le vrai risque.
healthchecks.io propose une offre gratuite qui alerte par email si le ping n'arrive pas.

### 2.4 Restaurer une fois pour de vrai — DoD de #45

Sur ton poste, là où est la clé privée. Il faut `rclone`, `gnupg` et les outils client
PostgreSQL 18.

```bash
export RCLONE_CONFIG_STORE_TYPE=s3 RCLONE_CONFIG_STORE_PROVIDER=Cloudflare \
       RCLONE_CONFIG_STORE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com \
       RCLONE_CONFIG_STORE_ACCESS_KEY_ID=... RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY=...
rclone lsf store:stracks-backups/daily
docker run -d --name restore-test -e POSTGRES_PASSWORD=essai -e POSTGRES_DB=stracks_restore -p 5433:5432 postgres:18-alpine
sh deploy/backup/restore.sh store:stracks-backups/daily/<fichier>.dump.gpg \
   postgresql://postgres:essai@localhost:5433/stracks_restore
docker rm -f restore-test
```

`restore.sh` affiche la durée et les comptages : utilisateurs, activités, points GPS,
dernière migration. **Reporter le résultat dans #45**, chronométrage compris, puis fermer
le ticket.

## 3. Initialiser EAS et les mises à jour OTA

Prérequis : un compte Expo. Le profil `production` d'`eas.json` est prêt : canal
`production`, AAB Android, numéro de build auto-incrémenté.

```bash
cd mobile
npm i -g eas-cli
eas login
eas init                    # écrit extra.eas.projectId dans app.json → à committer
eas update:configure        # écrit updates.url dans app.json → à committer
```

`expo-updates` est installé et configuré par le lot 5 :
- `runtimeVersion` suit la politique **fingerprint** : une mise à jour OTA n'atteint que les
  builds dont le code natif est identique ; un nouveau module natif impose une nouvelle
  build ;
- les mises à jour sont vérifiées à chaque lancement.

Publier une mise à jour, une fois une build de production installée :

```bash
eas update --channel production --message "Correctif …"
```

Premières builds : voir `mobile/DEV-BUILD.md` pour le dev build (#15). En production :

```bash
eas build --profile production --platform all
```

## 4. Clé Google Maps (#86)

**Sans elle, les cartes sont grises sur Android dans toute build EAS.** Expo Go a sa propre
clé, c'est pourquoi le défaut ne s'est jamais vu. La procédure est dans #86 : projet Google
Cloud, *Maps SDK for Android*, clé restreinte au package `com.stracks.app` et à l'empreinte
SHA-1 affichée par `eas credentials`. La clé se passe par une variable d'environnement EAS,
jamais dans le dépôt.

## 5. Monitoring Sentry

Livré par le lot 5 et **éteint sans DSN**, des deux côtés. Réglages de confidentialité :
aucune donnée personnelle, positions, emails, jetons et codes retirés, pas de traces de
performance. Choisir la **région UE** à la création de l'organisation.

1. Créer deux projets, `stracks-mobile` (React Native) et `stracks-backend` (Java).
2. Backend : ajouter `SENTRY_DSN=<dsn backend>` au `.env` du VPS, puis
   `docker compose -f docker-compose.prod.yml up -d backend`. Le journal doit afficher
   « Monitoring Sentry actif ».
3. Mobile : `eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value <dsn mobile> --environment production --visibility plaintext`.
   Le DSN n'est pas un secret : il ne permet que d'envoyer des événements.
4. **Traces lisibles (source maps)** — facultatif mais utile, et à faire seulement une fois
   le compte créé : ajouter le plugin `"@sentry/react-native/expo"` avec
   `{ "organization": "…", "project": "stracks-mobile" }` dans `app.json`, et le secret
   `SENTRY_AUTH_TOKEN` dans EAS. **Ne pas ajouter ce plugin avant** : sans jeton, l'étape
   d'envoi des source maps fait échouer les builds.

## 6. Fournisseur d'email (#77)

Sans lui, « mot de passe oublié » et le changement d'adresse n'envoient rien en production.
Les critères et les options sont dans #77.

## 7. Textes juridiques

Brouillons dans `docs/legal/`. **Ils doivent être relus et validés par un humain**, idéalement
un juriste, avant toute publication. Chaque `[À COMPLÉTER]` est une information que le code
ne peut pas donner : identité de l'éditeur, contact, localisation de l'hébergement, âge
minimum…

Les stores exigent une **URL publique** pour la politique de confidentialité. Options, sans
coût : GitHub Pages sur un dépôt public dédié, ou une page statique servie derrière le
Traefik existant.

## 8. Recette sur appareil

Chaque ticket contient ses cas de test, prêts à dérouler dès qu'un dev build existe :

| Ticket | Objet |
|---|---|
| #15 | Dev build EAS iOS + Android (prérequis de tout le reste) |
| #16, #70 | Suivi en arrière-plan écran verrouillé, pauses |
| #17, #53 | Calibration GPS et écart D+ sur traces réelles |
| #18, #36 | Batterie, et effet des modes GPS |
| #19 | Perte de signal (tunnel) |
| #81 | Migration du buffer SQLite local |
| #84 | Accessibilité, zones sûres, icônes, onboarding |
| #86 | Cartes Android |

## 9. Publication sur les stores

Comptes requis : Apple Developer Program (payant, annuel) et Google Play Console (frais
d'inscription uniques). **Les tarifs sont à vérifier** au moment de l'inscription. Textes,
réponses aux questionnaires de confidentialité et notes de revue : `docs/store/`.

**Point de vigilance Google Play** : l'accès à la **localisation en arrière-plan** impose une
déclaration dans la Play Console, avec **une vidéo** montrant la fonction et la demande de
permission. Sans elle, l'app est refusée. Le parcours à filmer est l'onboarding, puis un
démarrage de séance avec l'écran verrouillé.

```bash
eas submit --platform ios --latest       # après la première build production iOS
eas submit --platform android --latest   # la première soumission Android se fait à la main dans la Play Console
```
