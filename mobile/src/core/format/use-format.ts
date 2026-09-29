/**
 * Access to formatting from screens, with preferences already applied (#30, #4).
 *
 * Components never call `units.ts` directly: they would miss the preference and the unit
 * would become local to each screen again, the defect #30 fixes. This hook is the only
 * entry point.
 *
 * Falling back to `metric` while preferences haven't loaded yet is deliberate: showing
 * "—" everywhere for a second would be worse than showing kilometres to someone who chose
 * miles, and the value corrects itself once loaded.
 */
import React from 'react';

import { usePreferences } from '../preferences/use-preferences';
import { DEFAULT_PREFERENCES, speedDisplayFor } from '../preferences/schema';
import {
  distanceUnit,
  elevationUnit,
  formatAverage,
  formatDistance,
  formatDuration,
  formatElevation,
  formatSpeed,
  speedUnit,
  type SpeedDisplay,
  type Units,
} from './units';

export interface Formatter {
  units: Units;
  /** Speed display mode for a given sport (pace or speed). */
  speedDisplayFor(sportCode: string): SpeedDisplay;
  distance(meters: number): string;
  distanceUnit: string;
  elevation(meters: number): string;
  elevationUnit: string;
  speed(speedMs: number, sportCode: string): string;
  speedUnit(sportCode: string): string;
  average(distanceM: number, durationS: number, sportCode: string): string;
  duration(totalSeconds: number): string;
}

export function useFormat(): Formatter {
  const preferences = usePreferences();
  const resolved = preferences.data ?? DEFAULT_PREFERENCES;
  const units = resolved.units;

  return React.useMemo<Formatter>(() => {
    const displayFor = (sportCode: string) => speedDisplayFor(resolved, sportCode);
    return {
      units,
      speedDisplayFor: displayFor,
      distance: (meters) => formatDistance(meters, units),
      distanceUnit: distanceUnit(units),
      elevation: (meters) => formatElevation(meters, units),
      elevationUnit: elevationUnit(units),
      speed: (speedMs, sportCode) => formatSpeed(speedMs, units, displayFor(sportCode)),
      speedUnit: (sportCode) => speedUnit(units, displayFor(sportCode)),
      average: (distanceM, durationS, sportCode) =>
        formatAverage(distanceM, durationS, units, displayFor(sportCode)),
      duration: formatDuration,
    };
  }, [units, resolved]);
}
