# StrackS API — collection Bruno

Portage de `StrackS-API.postman_collection.json` au format Bruno, pour tester le backend
en production sur le VPS (ou en local) sans dépendance à un compte Postman.

## Démarrage

1. Ouvrir ce dossier (`bruno/`) dans l'app Bruno : **Open Collection**.
2. En haut à droite, choisir l'environnement :
   - **VPS** → `https://stracks.alshimysth.cloud` (backend en prod)
   - **Local** → `http://localhost:8080` (`cd backend && ./mvnw quarkus:dev`)
3. Lancer `1. Auth → Register` : crée un compte jetable et stocke le token automatiquement
   (variable de collection `{{token}}`, héritée par toutes les requêtes protégées).
4. Dérouler `4. Cycle de vie d'une séance` dans l'ordre (4.1 → 4.9) : simule une sortie
   course de ~25 min au Parc de la Villette et vérifie tout le cycle de vie (start, upload
   GPS idempotent, pause/resume, stop avec recalcul serveur, lecture, édition, suppression).

Les variables `activityId`, `userEmail`, `startedAt`, etc. sont posées par les scripts
`script:pre-request` / `tests` de chaque requête — rien à copier-coller.

Erreurs au format RFC 7807 (`application/problem+json`), couvertes par le dossier
`6. Cas d'erreur`.

## Dossiers

| Dossier | Contenu |
|---|---|
| `1. Auth` | Register, Login, renouvellement de session, mot de passe oublié (#74) |
| `2. Utilisateur` | Profil, modification, mot de passe (#73), vérification et changement d'email (#75), export RGPD (#76), suppression de compte |
| `3. Sports disponibles` | Registre de plugins (`GET /sport-types`) |
| `4. Cycle de vie d'une séance` | Start → upload GPS → pause/resume → stop → détail → tracé → notes → delete |
| `5. Historique & stats` | Pagination, agrégats semaine/mois |
| `6. Cas d'erreur (RFC 7807)` | 401, 403, 422, 409, 404 |

## En ligne de commande (local uniquement)

Les requêtes s'enchaînent sur un même compte : l'ordre compte. `4.9` supprime l'activité
dont le `409` du dossier 6 a besoin, et `Supprimer mon compte` doit passer en dernier.

```bash
cd backend && ./mvnw quarkus:dev          # dans un autre terminal
cd bruno
F4="4. Cycle de vie d'une séance"
npx @usebruno/cli run "1. Auth" "3. Sports disponibles" \
  "$F4/4.1 Démarrer une séance (running).bru" "$F4/4.2 Uploader le tracé GPS (300 points).bru" \
  "$F4/4.3 Mettre en pause.bru" "$F4/4.4 Reprendre.bru" "$F4/4.5 Terminer la séance.bru" \
  "$F4/4.6 Détail de l'activité.bru" "$F4/4.7 Relire le tracé GPS.bru" "$F4/4.8 Modifier les notes.bru" \
  "5. Historique & stats" "6. Cas d'erreur (RFC 7807)" "$F4/4.9 Supprimer l'activité.bru" \
  "2. Utilisateur" --env Local
```

⚠️ **Jamais contre `VPS`** : la collection crée des comptes et en supprime. Les seuils de
limitation de débit (#72) de la prod bloqueraient d'ailleurs une exécution répétée.

Les codes à usage unique (#74, #75) ne sont pas lisibles par la collection : en local, le
backend les écrit dans son journal (`LoggingEmailSender`).

## Notes VPS

- Le backend prod (`https://stracks.alshimysth.cloud`) répond derrière Traefik (TLS
  Let's Encrypt) — pas besoin d'être sur le même réseau que le VPS.
- Les requêtes `⚠️ destructives` (suppression de compte / d'activité) sont annotées dans
  leur nom et leur doc — à lancer en dernier dans une session de test.
