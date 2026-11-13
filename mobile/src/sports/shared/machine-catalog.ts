/**
 * Catalog side of a "machine" sport: treadmill, trainer. No GPS indoors; the athlete
 * reads the figures on the machine's display and reports them during or at the end of
 * the session. The draft is the set of readings; the server derives pace or speed.
 */
import { z, type ZodType } from 'zod';

import type { Formatter } from '../../core/format/use-format';
import type { IconName } from '../../design-system/components/Icon';
import type { SportAppearance } from '../../design-system/components/SportBadge';
import type { Activity } from '../../types/api';
import type { SportCatalogEntry, StatsTotalDisplay } from '../types';
import { distanceHeadline } from './gps-catalog';

/** A reading the athlete types in; `unit` is shown next to the field. */
export interface MachineField {
  key: string;
  label: string;
  unit: string;
  /** Converts the typed value (display unit) to the SI value sent to the server. */
  toMetric?: (value: number, units: Formatter['units']) => number;
  /** Display unit when it depends on the unit system the readings are typed in (km vs mi). */
  displayUnit?: (units: Formatter['units']) => string;
  min: number;
  max: number;
}

/**
 * Draft: what has been typed so far, as text (a half-typed "12," must survive a re-render),
 * plus the unit system the readings were typed in: the conversion happens at stop, and
 * the preference may not be loaded there.
 */
export interface MachineDraft {
  units: Formatter['units'];
  readings: Record<string, string>;
}

export interface MachineCatalogEntry extends SportCatalogEntry<MachineDraft> {
  trackingMode: 'timer';
  fields: MachineField[];
  /** Rows of the summary panel, from the server's metrics. */
  summaryRows: (metrics: Record<string, unknown>, activity: Activity, format: Formatter) => [string, string][];
}

export interface MachineEntrySpec {
  code: string;
  label: string;
  family: string;
  icon: IconName;
  appearance?: SportAppearance;
  tagline: string;
  fields: MachineField[];
  metricsSchema: ZodType;
  summaryRows: MachineCatalogEntry['summaryRows'];
}

export const machineStatsTotals: StatsTotalDisplay[] = [
  {
    key: 'distanceM',
    label: 'Distance',
    format: (value, format) => format.distance(value),
    unit: (format) => format.distanceUnit,
  },
];

/** Has anything been typed yet? Decides whether the draft's unit system is already fixed. */
export function hasReadings(draft: MachineDraft): boolean {
  return Object.values(draft.readings).some((text) => text != null && text.trim().length > 0);
}

/** "12,5" → 12.5; anything else → undefined (the field is simply not reported). */
export function parseReading(text: string | undefined): number | undefined {
  if (text == null) {
    return undefined;
  }
  const value = Number(text.trim().replace(',', '.'));
  return text.trim().length > 0 && Number.isFinite(value) ? value : undefined;
}

/** Turns the readings into the metrics sent at stop; out-of-range readings are dropped. */
export function machineMetricsFromDraft(fields: MachineField[], draft: MachineDraft): Record<string, unknown> {
  const metrics: Record<string, unknown> = { schemaVersion: 1 };
  for (const field of fields) {
    const value = parseReading(draft.readings[field.key]);
    if (value == null) {
      continue;
    }
    const metric = field.toMetric ? field.toMetric(value, draft.units) : value;
    if (metric >= field.min && metric <= field.max) {
      metrics[field.key] = Math.round(metric * 10) / 10;
    }
  }
  return metrics;
}

/** @param max the backend plugin's own ceiling, in metres (200 km for a treadmill) */
export const distanceField = (max = 200_000): MachineField => ({
  key: 'distanceM',
  label: 'Distance affichée',
  unit: 'km',
  displayUnit: (units) => (units === 'imperial' ? 'mi' : 'km'),
  // The display shows km or miles according to the preference; the server stores metres.
  toMetric: (value, units) => (units === 'imperial' ? value * 1609.344 : value * 1000),
  min: 0,
  max,
});

export function createMachineEntry(spec: MachineEntrySpec): MachineCatalogEntry {
  return {
    code: spec.code,
    label: spec.label,
    family: spec.family,
    icon: spec.icon,
    appearance: spec.appearance,
    tagline: spec.tagline,
    trackingMode: 'timer',
    hasSpeed: true,
    metricsSchema: spec.metricsSchema,
    fields: spec.fields,
    summaryRows: spec.summaryRows,
    initialDraft: () => ({ units: 'metric', readings: {} }),
    metricsFromDraft: (draft) => machineMetricsFromDraft(spec.fields, draft),
    headline: distanceHeadline,
    statsTotals: machineStatsTotals,
  };
}

export const machineSchemas = {
  treadmill: z.object({
    schemaVersion: z.literal(1),
    distanceM: z.number().nonnegative().optional(),
    inclinePct: z.number().nonnegative().optional(),
    avgPaceSecPerKm: z.number().nonnegative().optional(),
  }),
  indoorCycling: z.object({
    schemaVersion: z.literal(1),
    distanceM: z.number().nonnegative().optional(),
    avgPowerW: z.number().nonnegative().optional(),
    avgCadenceRpm: z.number().nonnegative().optional(),
    avgSpeedKmh: z.number().nonnegative().optional(),
  }),
};
