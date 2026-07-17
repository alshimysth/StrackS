# StrackS

App mobile de suivi multi-sport (anciennement « SportTracker ») — Phase 1 : course à pied & marche (tracking GPS), auth multi-utilisateur, extensibilité par sport comme contrainte n°1.

| Dossier | Contenu |
|---|---|
| `backend/` | API Quarkus + PostgreSQL (auth JWT, registre de sports, activités, tracés GPS, stats) |
| `mobile/` | App Expo / React Native (Expo Router, design system Volt Performance, auth) |
| `StrackDoc/` | Vault Obsidian : `raw/docs/` = PRD, ARCHITECTURE, PLAN (source de vérité) ; `wiki/` = notes compilées — **hors git** |
| `USE_CASES.md` | Cas d'utilisation Phase 1 et leur statut d'implémentation |

> Note de nommage : renommé en profondeur le 2026-07-17 — package Java `com.stracks`,
> groupId Maven `com.stracks`, identifiants d'app mobile `com.stracks.app`. Seuls les
> documents historiques (PRD, wiki) conservent l'ancien nom « SportTracker ».

Design system : projet Claude Design `d8a01989-0514-45c1-9a9c-fe1015bb2ffc` (source de vérité visuelle).

> **État vérifié le 2026-07-14** : backend et mobile démarrent tous les deux sans erreur ;
> le parcours inscription → connexion → profil a été testé en conditions réelles (API HTTP
> directe + écrans de connexion/inscription affichés dans un navigateur, thème et police du
> design system correctement appliqués). Voir §5 pour reproduire ce test.

---

## 1. Prérequis

| Outil | Version | Pour quoi |
|---|---|---|
| Java | 21+ | Backend Quarkus |
| Docker Desktop | — | PostgreSQL démarré automatiquement (Dev Services) — **doit être lancé avant `quarkus:dev`** |
| Node.js | 20+ | Mobile Expo |
| Xcode (macOS) | optionnel | Simulateur iOS — non installé sur cette machine au 2026-07-14 (seuls les Command Line Tools le sont) |
| Android Studio | optionnel | Émulateur Android — non installé sur cette machine au 2026-07-14 |
| App **Expo Go** sur un téléphone | optionnel | Tester sur un vrai appareil sans simulateur |

Sans Xcode ni Android Studio, deux options restent disponibles immédiatement : le mode **web**
(`npx expo start --web`, testé et fonctionnel) ou un **téléphone physique** via Expo Go.

---

## 2. Lancer le backend

**Premier lancement après un clone** : générer la paire de clés RSA qui signe les JWT
(volontairement exclue du repo — chaque environnement a la sienne) :

```bash
cd backend
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out src/main/resources/privateKey.pem
openssl rsa -pubout -in src/main/resources/privateKey.pem -out src/main/resources/publicKey.pem
```

Puis :

```bash
cd backend
./mvnw quarkus:dev
```

- API sur `http://localhost:8080`
- Swagger UI sur `http://localhost:8080/q/swagger-ui`
- Au premier lancement, Quarkus Dev Services télécharge et démarre un conteneur PostgreSQL
  automatiquement (aucune configuration manuelle de base de données) et applique les
  migrations Flyway (`users`, `activities`, `track_points`).
- Le serveur reste actif tant que le terminal tourne (`Ctrl+C` pour l'arrêter). Le rechargement
  à chaud est activé : modifier un fichier Java relance automatiquement la compilation.

**Vérifier que ça tourne** (dans un autre terminal) :

```bash
curl -i http://localhost:8080/api/v1/sport-types
# → HTTP 401 attendu (route protégée) : c'est le signe que le serveur répond correctement
```

**Lancer les tests automatisés** :

```bash
./mvnw test    # 18 tests : auth, cycle de vie d'activité, idempotence, anti-IDOR, moteur GPS
```

---

## 3. Lancer l'application mobile

```bash
cd mobile
npm install
npx expo start
```

Le terminal affiche un QR code et un menu interactif :

| Touche | Cible | Prérequis |
|---|---|---|
| `w` | Navigateur web | Aucun — fonctionne immédiatement |
| `i` | Simulateur iOS | Xcode installé |
| `a` | Émulateur Android | Android Studio installé |
| Scanner le QR code | Téléphone physique via Expo Go | App Expo Go installée, même réseau Wi-Fi que le Mac |

> **Pourquoi le projet est sur Expo SDK 54 et non la dernière version (2026-07-17)** : Apple
> n'avait pas encore validé la build Expo Go SDK 57 au moment du test — Expo Go disponible sur
> l'App Store restait figé sur SDK 54. Scanner le QR code d'un projet SDK 57 avec cet Expo Go
> déclenche le message trompeur *« Download the latest version of Expo Go »*, alors que
> l'app est déjà à jour : c'est le **projet** qui est trop récent pour l'Expo Go du store, pas
> l'inverse. Rester sur SDK 54 jusqu'à ce qu'Expo Go SDK 57+ soit publié sur l'App Store (sinon,
> passer par une build de développement EAS, qui n'a pas cette contrainte).

### Adresse de l'API selon la cible

Le client mobile appelle `http://localhost:8080` par défaut. Cette adresse ne fonctionne que
pour le simulateur iOS et le mode web (ils partagent le réseau local du Mac). Pour les autres
cibles, définir la variable d'environnement `EXPO_PUBLIC_API_URL` **avant** de lancer `expo start` :

```bash
# Émulateur Android (10.0.2.2 = alias spécial vers le localhost du Mac)
EXPO_PUBLIC_API_URL=http://10.0.2.2:8080 npx expo start

# Téléphone physique (remplacer par l'IP locale du Mac, ex. 192.168.1.23)
EXPO_PUBLIC_API_URL=http://192.168.1.23:8080 npx expo start
```

Trouver l'IP locale du Mac : `ipconfig getifaddr en0`.

**Vérifications statiques** (sans lancer l'app) :

```bash
npx tsc --noEmit                       # typecheck — doit être silencieux
npx expo export --platform web         # bundling complet — doit se terminer sans erreur
```

---

## 4. Tester l'authentification depuis l'application

Backend lancé (§2) et mobile lancé en mode web (§3, touche `w`) :

1. Le navigateur s'ouvre sur `http://localhost:8082` (ou le port indiqué dans le terminal) —
   l'app redirige automatiquement vers l'écran **Connexion** (aucune session enregistrée).
2. Cliquer sur **« Créer un compte »**.
3. Remplir un email, un mot de passe (8 caractères minimum), un nom affiché (optionnel), puis
   **« Créer mon compte »**.
4. L'app appelle `POST /api/v1/auth/register`, reçoit un jeton JWT, le stocke, et redirige vers
   l'onglet **Accueil** — le nom affiché apparaît en haut de l'écran.
5. Onglet **Profil** → **« Se déconnecter »** → retour à l'écran de connexion.
6. Se reconnecter avec les mêmes identifiants → **« Se connecter »** → retour à l'accueil.
   Ce test passe par `POST /api/v1/auth/login`.
7. Sur l'onglet **Accueil**, les sports (« Course », « Marche ») doivent apparaître : ils sont
   lus en direct depuis `GET /api/v1/sport-types` sur le backend — s'ils n'apparaissent pas,
   le backend n'est pas joignable (voir §6, dépannage).

Sur simulateur iOS, émulateur Android ou téléphone physique, le parcours est identique — seule
l'adresse de l'API change (§3).

### Vérification équivalente en ligne de commande

Utile pour confirmer que le backend seul fonctionne, indépendamment de l'app mobile :

```bash
curl -s -X POST http://localhost:8080/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"motdepasse8","displayName":"Test"}'
# → { "token": "...", "user": { "email": "test@example.com", ... } }

curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"motdepasse8"}'
# → même structure, nouveau token
```

---

## 5. Ce qui a été vérifié le 2026-07-14

| Vérification | Méthode | Résultat |
|---|---|---|
| Démarrage backend + migrations Flyway | `./mvnw quarkus:dev` | OK — 3 migrations appliquées, serveur up en ~6 s |
| Inscription | `curl POST /auth/register` | OK — 201, jeton JWT valide reçu |
| Connexion | `curl POST /auth/login` | OK — 200, jeton JWT valide reçu |
| Route protégée sans jeton | `curl GET /users/me` sans en-tête | OK — 401 |
| Route protégée avec jeton | `curl GET /users/me` avec en-tête | OK — 200, profil renvoyé |
| Démarrage mobile en mode web | `npx expo start --web` | OK — bundler prêt, page servie (HTTP 200) |
| Rendu de l'écran de connexion | Capture d'écran du navigateur | OK — police Sora/DM Sans, thème sombre, champs et bouton conformes au design system |
| Rendu de l'écran d'inscription | Capture d'écran du navigateur | OK — idem |

**Non couvert par cette vérification** : interaction clic-par-clic simulée automatiquement
(l'extension de navigateur nécessaire n'était pas connectée dans cette session) — le parcours
décrit en §4 n'a donc pas été rejoué gestuellement par un outil, mais chaque brique qu'il
enchaîne (rendu des écrans, endpoints appelés) a été vérifiée séparément. À tester manuellement
par vous-même pour une confirmation complète du geste.

---

## 6. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `quarkus:dev` échoue au démarrage, erreur liée à Docker | Docker Desktop n'est pas lancé | Démarrer Docker Desktop, réessayer |
| Erreur Hibernate sur les colonnes JSON au démarrage | Config manquante (déjà présente dans ce repo) | Vérifier que `application.properties` contient `quarkus.hibernate-orm.mapping.format.global=ignore` |
| `pause`/`resume` renvoient 415 | Client envoie un `Content-Type` inattendu sur une requête sans corps | Non applicable si vous utilisez l'app mobile ou les exemples `curl` ci-dessus |
| L'app mobile n'affiche aucun sport à l'accueil | Le backend n'est pas joignable depuis la cible choisie | Vérifier `EXPO_PUBLIC_API_URL` (§3) et que `./mvnw quarkus:dev` tourne toujours |
| Émulateur Android : `ECONNREFUSED` vers `localhost` | `localhost` sur Android émulé pointe vers l'émulateur lui-même, pas le Mac | Utiliser `10.0.2.2` (§3) |
| Écran blanc/noir en mode web | Bundler encore en cours de compilation au premier chargement | Rafraîchir après quelques secondes |

---

## 7. Règles d'architecture (résumé)

- Aucun `switch (sportType)` hors des registres (`SportRegistry` backend, `sports/registry.ts` mobile). Ajouter un sport = ajouter un module, zéro modification du socle.
- Métriques par sport dans `activities.metrics` (JSONB), schéma validé par le module des deux côtés.
- Styles uniquement via `mobile/src/design-system/` (tokens Claude Design) — pas de valeurs en dur.
- Détails : `StrackDoc/raw/docs/ARCHITECTURE.md`.

## 8. Ce qui n'est pas encore fonctionnel

L'écran de tracking live (carte + métriques pendant une séance) est un placeholder textuel :
le moteur de séance (`core/session`) et le moteur GPS (`core/gps`, Epic 3) restent à
implémenter côté mobile. L'auth, la sélection de sport, l'historique (liste simple) et le
profil sont, eux, pleinement fonctionnels et testables dès maintenant.
