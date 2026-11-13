/** Screens of the walking module, generated from its catalog entry. */
import { createGpsScreens } from '../shared/gps-screens';
import type { SportScreens } from '../types';
import { walkingEntry } from './catalog';

export const walkingScreens: Record<string, SportScreens> = {
  [walkingEntry.code]: createGpsScreens(walkingEntry),
};
