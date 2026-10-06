# Dev build EAS — procédure (#15)

Expo Go ne supporte **ni la localisation en arrière-plan ni `expo-task-manager`**. Tout
l'Epic 4 (#16, #19) exige donc un *development build*. Ce document décrit la procédure ;
les commandes marquées 🔑 demandent un compte Expo et ne peuvent pas être jouées en CI.

## Une fois pour toutes

```bash
npm install -g eas-cli
eas login                 # 🔑 compte Expo
```

Le projet EAS existe déjà (`@alshimysth/stracks`) : `extra.eas.projectId` et `owner` sont
committés dans `app.json` (#90). **Ne pas relancer `eas init`**, qui pourrait créer un second
projet. `expo-dev-client`, exigé par le profil `development`, est dans les dépendances.

Pré-requis iOS : l'**Apple Developer Program** (99 $/an). Un Apple ID gratuit ne permet pas à
EAS de générer le profil de provisionnement ad hoc d'un iPhone physique.

## Profils

`eas.json` définit trois profils :

| Profil | Usage | Particularité |
|---|---|---|
| `development` | dev build sur device, avec Metro | `developmentClient: true`, APK côté Android |
| `preview` | recette interne, sans Metro | APK installable directement |
| `production` | Play Store / App Store | AAB Android, `autoIncrement` |

## Générer le build

```bash
# iOS — 🔑 demande un compte Apple Developer pour l'enregistrement du device
eas build --profile development --platform ios

# Android — aucun compte tiers nécessaire
eas build --profile development --platform android
```

Pour iOS, EAS demande d'enregistrer l'UDID de l'iPhone de test au premier build
(`eas device:create`). Sans cet enregistrement, l'IPA s'installe mais refuse de démarrer.

## Lancer l'app contre Metro

```bash
npx expo start --dev-client
```

Puis ouvrir l'app installée sur le device — **pas Expo Go**. Le hot reload fonctionne en
LAN, sans `--tunnel`.

> Le contournement `--tunnel` documenté le 2026-08-07 (blocage Expo Go sur LAN, permission
> iOS « Réseau local ») ne concerne que Expo Go. Un dev build s'en affranchit : c'est un
> bénéfice secondaire de #15, qui devrait clore #21.

## Vérifier que l'arrière-plan fonctionne

C'est la DoD de #16 et elle **ne se vérifie pas depuis un poste de travail** :

1. Démarrer une séance, accepter la permission « Toujours » quand elle est demandée.
2. Verrouiller l'écran, marcher 30 minutes.
3. Rouvrir l'app : le tracé doit être continu, sans trou au moment du verrouillage.
4. Vérifier l'absence de saut de distance à la reprise (#19).

Sur Android, une notification persistante « Séance en cours » doit apparaître pendant
toute la séance — c'est le *foreground service*, sans lui le système tue la tâche au bout
de quelques minutes.

## Si la permission « Toujours » est refusée

L'app **ne bloque pas** : elle reste en mode premier plan et le signale
(`backgroundTracking: false` dans le store de séance). La séance continue tant que l'écran
est allumé. C'est une dégradation assumée, pas un échec — voir la DoD de #16.
