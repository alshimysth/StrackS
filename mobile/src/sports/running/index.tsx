/** Screens of the running family, generated from the catalog entries. */
import { createGpsScreens } from '../shared/gps-screens';
import { createMachineScreens } from '../shared/machine-screens';
import type { SportScreens } from '../types';
import { runningEntry, trailRunningEntry, treadmillRunningEntry } from './catalog';

export const runningScreens: Record<string, SportScreens> = {
  [runningEntry.code]: createGpsScreens(runningEntry),
  [trailRunningEntry.code]: createGpsScreens(trailRunningEntry),
  [treadmillRunningEntry.code]: createMachineScreens(treadmillRunningEntry),
};
