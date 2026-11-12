/**
 * The ONLY file in the project listing the sports (PRD constraint no. 1).
 * Adding a sport = creating (or extending) src/sports/<family>/ + one line here, and its
 * screens in the family's `index.tsx` (checked by `registry.ts` at load).
 *
 * Pure data: importing it costs nothing, which is what lets a label, a list or the stats
 * screen know the sports without dragging the session engine (maps, SQLite) behind them.
 * The backend registry discovers its plugins by CDI; JavaScript has no such discovery,
 * hence this explicit list. `registry.parity.test.ts` checks it against the Java sources.
 */
import { boulderingEntry, ropeClimbingEntry } from './climbing/catalog';
import { cyclingEntry, indoorCyclingEntry, mountainBikingEntry } from './cycling/catalog';
import { racketEntries } from './racket/catalog';
import { runningEntry, trailRunningEntry, treadmillRunningEntry } from './running/catalog';
import { walkingEntry } from './walking/catalog';

import type { SportCatalogEntry } from './types';

export const sportEntries: SportCatalogEntry[] = [
  runningEntry,
  trailRunningEntry,
  treadmillRunningEntry,
  walkingEntry,
  cyclingEntry,
  mountainBikingEntry,
  indoorCyclingEntry,
  boulderingEntry,
  ropeClimbingEntry,
  ...racketEntries,
] as SportCatalogEntry[];

export const sportCatalog: Record<string, SportCatalogEntry> = Object.fromEntries(
  sportEntries.map((entry) => [entry.code, entry]),
);
