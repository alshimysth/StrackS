/**
 * Contrat d'un module de sport côté mobile. Le socle (core/, app/) ne connaît
 * aucun sport : il ne consomme que cette interface via sports/registry.ts.
 */
import type React from 'react';
import type { ZodSchema } from 'zod';

import type { Activity } from '../types/api';

export interface LiveMetric {
  label: string;
  value: string;
  unit?: string;
}

/** État de séance fourni par le moteur core/session (Epic 3). */
export interface SessionState {
  elapsedS: number;
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  /** Vitesse lissée en m/s sur la fenêtre récente. */
  smoothedSpeedMs: number;
}

export interface SportModule {
  code: string;
  label: string;
  usesGps: boolean;
  /** Écran de tracking live, rendu plein écran par le socle (Epic 3/4). */
  TrackingScreen: React.ComponentType;
  /** Bloc de résumé spécifique (fin de séance, détail d'activité). */
  SummaryPanel: React.ComponentType<{ activity: Activity }>;
  /** Métriques dérivées affichées en live à partir de l'état de séance. */
  deriveLiveMetrics(session: SessionState): LiveMetric[];
  /** Schéma zod du champ metrics (miroir du schéma backend). */
  metricsSchema: ZodSchema;
}
