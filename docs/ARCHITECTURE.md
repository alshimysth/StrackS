# StrackS — architecture du code (clean architecture)

> Complète `CLAUDE.md` (conventions) et le vault (`StrackDoc/wiki`, conception). Ce document
> décrit **comment le code est organisé** depuis la refonte multisport de novembre 2026 :
> les couches, la règle de dépendance, et le contrat qu'un sport doit remplir.

## 1. La règle unique

Les dépendances pointent **vers l'intérieur** : l'API et la persistance dépendent des cas
d'usage, les cas d'usage dépendent du domaine, le domaine ne dépend de rien. Un sport est
un plugin branché sur le domaine ; le socle ne connaît aucun sport.

```
   api (HTTP)  ──►  application (cas d'usage, ports)  ──►  domain (modèle, règles, contrat plugin)
                           ▲                                        ▲
   infrastructure (Panache, SQL) ─┘            sports/<famille>/ ───┘   (implémente SportPlugin)
```

## 2. Backend — `core/activity`

| Couche | Package | Contenu | Dépend de |
|---|---|---|---|
| Domaine | `core/activity/domain` | `ActivityEntity`, `TrackPointEntity` (JPA, sans Panache), `SportPlugin`, `SportTypeDescriptor`, `SportFamily`, `TrackingMode`, `FinalMetrics`, `SportStats`, `PersonalRecordMetric`, `GpsComputations`, `CalorieEstimator`, `MetricsSchema`, bases `GpsSportPlugin` / `TimerSportPlugin` | rien (`core/common`, `core/user/AthleteProfile`) |
| Application | `core/activity/application` | `ActivityService`, `StatsService`, `SportRegistry`, commandes (`ActivityCommands`), **ports** `ActivityRepository`, `TrackPointRepository` | domaine |
| Interface | `core/activity/api` | ressources JAX-RS et DTO (`ActivityDtos`, `StatsDtos`, `SportTypeDtos`) : mappent requête → commande, entité → réponse. Aucune règle métier. | application |
| Infrastructure | `core/activity/infrastructure/persistence` | `PanacheActivityRepository`, `PanacheTrackPointRepository` : implémentent les ports (JPQL, SQL natif du bucketing) | application, domaine |

Les entités JPA servent de modèle de domaine (annotations = métadonnées, pas de
comportement). Elles **ne se persistent plus elles-mêmes** : plus de `PanacheEntityBase`,
toute lecture passe par un port et est bornée à l'utilisateur (anti-IDOR par construction).

Les contextes `core/user`, `core/auth`, `core/mail` gardent leur organisation d'origine
(ressource + service + entité Panache) : leur passage au même découpage est un ticket
séparé, sans valeur fonctionnelle immédiate.

### Contrat plugin v2 (`SportPlugin`)

| Méthode | Rôle |
|---|---|
| `descriptor()` | code (snake_case), libellé, **famille**, **mode de suivi** (`GPS` / `TIMER`), version du schéma |
| `validateMetrics(JsonNode)` | rapport du client, validé par un `MetricsSchema` déclaratif ; clé inconnue = 422 |
| `complete(activity, track)` | retourne `FinalMetrics(metrics, distanceM?)` : le sport dit lui-même s'il a une distance à écrire dans la colonne |
| `computeStats(activities)` | `SportStats.of(descriptor, activities, totals)` — le socle calcule séances, durée, calories ; le plugin nomme ses `totals` |
| `estimateCalories`, `personalRecordMetrics`, `maxGpsSpeedKmh` | inchangés dans l'esprit |

Deux bases évitent la copie :

- **`GpsSportPlugin`** : filtre la trace, calcule distance / dénivelé / vitesse max, calories
  par MET sur la vitesse, record « plus longue distance ». Le module fournit son MET, son
  plafond et `addSportMetrics` (allure, vitesse, splits).
- **`TimerSportPlugin`** : pas de trace, le rapport du client est la donnée brute. Le module
  déclare son schéma (avec les clés `computed()` que le serveur recalcule toujours) et
  `derive()`. Un PATCH des `metrics` relance `complete()` : un total ne peut jamais
  contredire son détail.

### Familles et sports

| Famille (package) | Sports | Mode |
|---|---|---|
| `running` | `running`, `trail_running` | GPS |
| | `treadmill_running` | TIMER (distance relevée) |
| `walking` | `walking` | GPS |
| `cycling` | `cycling`, `mountain_biking` | GPS |
| | `indoor_cycling` | TIMER (distance, puissance, cadence) |
| `climbing` | `bouldering`, `rope_climbing` | TIMER (journal de blocs/voies, cotations françaises) |
| `racket` | `tennis`, `padel`, `badminton`, `squash`, `table_tennis` | TIMER (sets) |

Un package = une famille : les sports d'une même famille partagent du code
(`RunningFamily`, `CyclingFamily`, `ClimbingPlugin`, `RacketSportPlugin`). La règle
« un sport ne dépend jamais d'un autre » s'applique **entre familles**.

Ajouter un sport : une classe `@ApplicationScoped` sous `sports/<famille>/` qui étend une
des deux bases. Zéro fichier de `core/` modifié, zéro migration. Le test
`SportCatalogTest` liste ce qui doit être exposé.

## 3. Mobile — `mobile/src`

| Couche | Dossier | Contenu |
|---|---|---|
| Présentation | `app/` | routes Expo Router, zéro logique métier |
| Application | `core/session` (moteur), `core/activity` (présentation d'un sport, titre), `core/preferences`, `core/format` | cas d'usage, pur quand c'est possible (`sport-order.ts`, `weekly-goal.ts`) |
| Infrastructure | `core/api` (HTTP), `core/gps` (expo-location), `core/session/buffer*` (SQLite), `core/map`, `core/network` | adaptateurs |
| Plugins | `sports/` | un dossier par famille |
| UI kit | `design-system/` | composants et jetons (Claude Design → code) |

### Un module sport en deux couches

`sports/types.ts` sépare **le catalogue** (données pures : libellé, famille, icône, schéma
zod, `headline`, `statsTotals`, `initialDraft`, `metricsFromDraft`) des **écrans**
(`TrackingScreen`, `SummaryPanel`, qui tirent le moteur de séance, la carte, SQLite).

- `sports/catalog.ts` — **le seul fichier listant les sports**. Pur : un libellé ou l'écran
  de stats l'importent sans charger la carte native.
- `sports/registry.ts` — catalogue + écrans, vérifié au chargement (un sport catalogué sans
  écrans fait échouer l'app au démarrage, pas au premier tap). Seuls `app/tracking.tsx` et
  `ActivityDetailBody` en ont besoin.
- `core/activity/sport-presentation.ts` — le seul endroit où le socle consulte le
  catalogue pour afficher un sport (libellé, pastille, regroupement par famille).

### Le moteur de séance n'est plus centré GPS

`core/session/use-session-store.ts` reçoit un `SessionSportSpec` (`trackingMode`,
plafond GPS, brouillon initial). En mode `gps` : watch, arrière-plan, accumulateur,
upload par lots, flush obligatoire avant le stop. En mode `timer` : chrono seul, un
**brouillon** (`draft`) tenu par le module, persisté dans le buffer SQLite à chaque
modification (colonnes `tracking_mode`, `draft_json`, migrées à l'ouverture) et
rejoué par `recover()`. `stop({ metrics })` envoie le rapport du module.

Deux écrans génériques : `SessionTrackingScreen` (GPS : héros + grille) et
`TimerTrackingScreen` (chrono + panneau du sport). Aucun module ne copie la logique
pause / terminer.

Fabriques : `shared/gps-catalog` + `gps-screens` (cinq sports GPS), `shared/machine-*`
(tapis, home-trainer), `climbing/`, `racket/`.

### Parité client / serveur

`sports/__tests__/registry.parity.test.ts` lit les sources Java : codes, familles, modes
de suivi et plafonds GPS doivent coïncider. `climbing/grades.ts` reflète `FrenchGrade.java`
(même formule d'ordinal). Les schémas zod reflètent les `MetricsSchema` Java.

## 4. Statistiques génériques (#46)

Le socle ne somme que ce que toute activité possède : séances, durée, **calories**
(colonne). Le reste vit dans `totals`, nommé par le plugin ; l'écran mobile n'affiche
que les clés que le catalogue sait décrire (`statsTotals`), jamais un « — » pour une clé
absente. Un sport sans distance n'a ni carte de distance, ni zéro trompeur.
