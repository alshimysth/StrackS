/**
 * Contrat d'un module de sport côté mobile. Le socle (core/, app/) ne connaît
 * aucun sport : il ne consomme que cette interface via sports/registry.ts.
 * SessionState/LiveMetric sont définis par core/session (le moteur) et
 * re-exportés ici pour les modules.
 */
import type React from 'react';
import type { ZodSchema } from 'zod';

import type { LiveMetric, SessionState } from '../core/session/types';
import type { Activity } from '../types/api';

export type { LiveMetric, SessionState };

export interface SportModule {
  code: string;
  label: string;
  usesGps: boolean;
  /**
   * Seuil de plausibilité GPS (miroir de SportPlugin.maxGpsSpeedKmh backend) —
   * au-delà, un segment est écarté comme bruit. Requis si usesGps.
   */
  maxGpsSpeedKmh?: number;
  /** Écran de tracking live, rendu plein écran par le socle (Epic 3/4). */
  TrackingScreen: React.ComponentType;
  /** Bloc de résumé spécifique (fin de séance, détail d'activité). */
  SummaryPanel: React.ComponentType<{ activity: Activity }>;
  /** Métriques dérivées affichées en live à partir de l'état de séance. */
  deriveLiveMetrics(session: SessionState): LiveMetric[];
  /** Schéma zod du champ metrics (miroir du schéma backend). */
  metricsSchema: ZodSchema;
}
