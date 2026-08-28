/**
 * Accès au formatage depuis les écrans, préférences déjà appliquées (#30, #4).
 *
 * Les composants n'appellent jamais `units.ts` directement : ils passeraient à côté de
 * la préférence et l'unité redeviendrait locale à chaque écran — le défaut que #30
 * corrige. Ce hook est le seul point d'entrée.
 *
 * Le repli sur `metric` quand les préférences n'ont pas encore chargé est délibéré :
 * afficher « — » partout pendant une seconde serait pire qu'afficher des kilomètres à
 * quelqu'un qui a choisi les miles, et la valeur se corrige d'elle-même au chargement.
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
  /** Mode d'affichage de la vitesse pour un sport donné (allure ou vitesse). */
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
