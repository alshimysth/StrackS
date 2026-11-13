/**
 * Contract of a sport module on mobile. The core (core/, app/) knows no sport: it only
 * consumes these interfaces through sports/catalog.ts and sports/registry.ts.
 *
 * A module is split in two layers, so that a list or a label never drags a native map or
 * the SQLite engine behind it:
 *  - the **catalog entry** (`SportCatalogEntry`): pure data and pure functions, label,
 *    family, icon, schema, how to summarise a session in one line, how to show the
 *    sport's totals. Safe to import from anywhere.
 *  - the **screens** (`SportScreens`): the live tracking screen and the summary panel,
 *    which pull the session engine. Only the tracking route and the detail body need them.
 *
 * Two kinds of sport, mirroring the backend's `GpsSportPlugin` / `TimerSportPlugin`:
 *  - `trackingMode: 'gps'`: the session engine records a track; the module only chooses
 *    what to show live (hero, grid) and in the summary;
 *  - `trackingMode: 'timer'`: no track; the module keeps a **draft** during the session
 *    (routes climbed, sets played, distance read on a machine), persisted by the engine
 *    so it survives a kill, and turns it into the `metrics` sent at stop.
 */
import type React from 'react';
import type { ZodType } from 'zod';

import type { Formatter } from '../core/format/use-format';
import type { LiveMetric, SessionState } from '../core/session/types';
import type { IconName } from '../design-system/components/Icon';
import type { SportAppearance } from '../design-system/components/SportBadge';
import type { Activity } from '../types/api';

export type { LiveMetric, SessionState };

/** Lowercase on the client; the server exposes the same two values in uppercase. */
export type TrackingMode = 'gps' | 'timer';

/**
 * A total named by the backend plugin under `SportStats.totals`, with how to show it.
 * The stats screen renders what the module declares and ignores what it doesn't: a key
 * the module can't describe would otherwise appear as a bare number.
 */
export interface StatsTotalDisplay {
  key: string;
  label: string;
  format(value: number, format: Formatter): string;
  unit?(format: Formatter): string | undefined;
}

export interface SportCatalogEntry<Draft = unknown> {
  code: string;
  label: string;
  /** Family code, as exposed by the backend descriptor (`running`, `cycling`…). */
  family: string;
  /** Sport pictogram (#39), chosen by the module from the design system vocabulary. */
  icon?: IconName;
  /** Badge colours, from the design tokens. Absent: the theme table or a neutral grey. */
  appearance?: SportAppearance;
  /** One line under the sport's name on the home screen ("GPS · carte · allure"). */
  tagline: string;
  trackingMode: TrackingMode;
  /**
   * GPS plausibility threshold (mirror of the backend's SportPlugin.maxGpsSpeedKmh):
   * beyond it, a segment is dropped as noise. Required if `trackingMode === 'gps'`.
   */
  maxGpsSpeedKmh?: number;
  /** Does the pace/speed preference make sense for this sport (it has a distance)? */
  hasSpeed: boolean;
  /** zod schema of the metrics field (mirror of the backend schema). */
  metricsSchema: ZodType;
  /** Timer sports: the draft a session starts with. */
  initialDraft?(): Draft;
  /** Timer sports: turns the draft into the metrics sent at stop. */
  metricsFromDraft?(draft: Draft): Record<string, unknown>;
  /** One line summarising a completed session in a list ("12 blocs · 9 réussis"). */
  headline?(activity: Activity, format: Formatter): string | null;
  /** Totals of this sport the stats screen can show. */
  statsTotals: StatsTotalDisplay[];
}

export interface SportScreens {
  /** Live tracking screen, rendered full screen by the core (Epic 3/4). */
  TrackingScreen: React.ComponentType;
  /** Specific summary block (end of session, activity detail). */
  SummaryPanel: React.ComponentType<{ activity: Activity }>;
}

export type SportModule<Draft = unknown> = SportCatalogEntry<Draft> & SportScreens;

export function usesGps(entry: Pick<SportCatalogEntry, 'trackingMode'>): boolean {
  return entry.trackingMode === 'gps';
}
