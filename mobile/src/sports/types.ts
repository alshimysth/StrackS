/**
 * Contract of a sport module on mobile. The core (core/, app/) knows no sport: it only
 * consumes this interface through sports/registry.ts. SessionState/LiveMetric are defined
 * by core/session (the engine) and re-exported here for the modules.
 */
import type React from 'react';
import type { ZodSchema } from 'zod';

import type { LiveMetric, SessionState } from '../core/session/types';
import type { IconName } from '../design-system/components/Icon';
import type { Activity } from '../types/api';

export type { LiveMetric, SessionState };

export interface SportModule {
  code: string;
  label: string;
  /**
   * Sport pictogram (#39), chosen by the module from the design system vocabulary. The core
   * shows it without knowing which sport it is; a new sport declares a new one without
   * touching the screens.
   */
  icon?: IconName;
  usesGps: boolean;
  /**
   * GPS plausibility threshold (mirror of the backend's SportPlugin.maxGpsSpeedKmh):
   * beyond it, a segment is dropped as noise. Required if usesGps.
   */
  maxGpsSpeedKmh?: number;
  /** Live tracking screen, rendered full screen by the core (Epic 3/4). */
  TrackingScreen: React.ComponentType;
  /** Specific summary block (end of session, activity detail). */
  SummaryPanel: React.ComponentType<{ activity: Activity }>;
  /** Derived metrics shown live from the session state. */
  deriveLiveMetrics(session: SessionState): LiveMetric[];
  /** zod schema of the metrics field (mirror of the backend schema). */
  metricsSchema: ZodSchema;
}
