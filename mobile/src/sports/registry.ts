/**
 * The full modules: catalog entries with their screens. Only the tracking route and the
 * activity detail body need this; everything else reads `catalog.ts`.
 *
 * Every catalogued sport must have screens: a sport that could be picked but not tracked
 * would be a dead end, so the mismatch fails here, at load, not at the first tap.
 */
import { sportEntries } from './catalog';
import { climbingScreens } from './climbing';
import { cyclingScreens } from './cycling';
import { racketScreens } from './racket';
import { runningScreens } from './running';
import { walkingScreens } from './walking';
import type { SportModule, SportScreens } from './types';

const screensByCode: Record<string, SportScreens> = {
  ...runningScreens,
  ...walkingScreens,
  ...cyclingScreens,
  ...climbingScreens,
  ...racketScreens,
};

export const sportRegistry: Record<string, SportModule> = Object.fromEntries(
  sportEntries.map((entry) => {
    const screens = screensByCode[entry.code];
    if (screens == null) {
      throw new Error(`Le sport ${entry.code} est catalogué sans écrans.`);
    }
    return [entry.code, { ...entry, ...screens }];
  }),
);
