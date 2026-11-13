/** Screens of the cycling family, generated from the catalog entries. */
import { createGpsScreens } from '../shared/gps-screens';
import { createMachineScreens } from '../shared/machine-screens';
import type { SportScreens } from '../types';
import { cyclingEntry, indoorCyclingEntry, mountainBikingEntry } from './catalog';

export const cyclingScreens: Record<string, SportScreens> = {
  [cyclingEntry.code]: createGpsScreens(cyclingEntry),
  [mountainBikingEntry.code]: createGpsScreens(mountainBikingEntry),
  [indoorCyclingEntry.code]: createMachineScreens(indoorCyclingEntry),
};
