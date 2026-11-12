/**
 * Catalog side of a geolocated sport: what every GPS module declares, without a screen.
 *
 * Running, walking, trail, road cycling and mountain biking share the whole engine and
 * nine tenths of their behaviour; what a module really owns is a handful of values:
 * code, label, ceiling, which figure is the hero. Writing five near-identical files would
 * guarantee their divergence at the first retouch (lot H review, backend side).
 */
import { z, type ZodType } from 'zod';

import type { Formatter } from '../../core/format/use-format';
import type { IconName } from '../../design-system/components/Icon';
import type { SportAppearance } from '../../design-system/components/SportBadge';
import type { Activity } from '../../types/api';
import type { SportCatalogEntry, StatsTotalDisplay } from '../types';

/** What every GPS module writes (mirror of the backend `GpsSportPlugin` base schema). */
export const gpsMetricsBase = z.object({
  schemaVersion: z.literal(1),
  elevationGainM: z.number().nonnegative().optional(),
  elevationLossM: z.number().nonnegative().optional(),
  avgPaceSecPerKm: z.number().nonnegative().optional(),
  avgSpeedKmh: z.number().nonnegative().optional(),
  maxSpeedKmh: z.number().nonnegative().optional(),
  elevationGainPerKmM: z.number().nonnegative().optional(),
  splits: z.array(z.object({ km: z.number(), paceSecPerKm: z.number() })).optional(),
});

export type GpsMetrics = z.infer<typeof gpsMetricsBase>;

export interface GpsCatalogEntry extends SportCatalogEntry {
  trackingMode: 'gps';
  maxGpsSpeedKmh: number;
  /** Hero of the live screen: the pace/speed, or the climb for a mountain sport. */
  hero: 'speed' | 'elevation';
}

export interface GpsEntrySpec {
  code: string;
  label: string;
  family: string;
  icon: IconName;
  appearance?: SportAppearance;
  tagline: string;
  /** Mirror of the backend plugin's MAX_SPEED_KMH. */
  maxGpsSpeedKmh: number;
  hero?: 'speed' | 'elevation';
  /** Narrower schema when the sport writes fewer keys; defaults to the base. */
  metricsSchema?: ZodType;
}

/** Totals a GPS sport declares on the server (`GpsComputations.gpsTotals`). */
export const gpsStatsTotals: StatsTotalDisplay[] = [
  {
    key: 'distanceM',
    label: 'Distance',
    format: (value, format) => format.distance(value),
    unit: (format) => format.distanceUnit,
  },
  {
    key: 'elevationGainM',
    label: 'Dénivelé +',
    format: (value, format) => format.elevation(value),
    unit: (format) => format.elevationUnit,
  },
];

/** "4,21 km · 5'31"/km", the line a list shows for a distance sport. */
export function distanceHeadline(activity: Activity, format: Formatter): string | null {
  if (activity.distanceM == null) {
    return null;
  }
  const distance = `${format.distance(Number(activity.distanceM))} ${format.distanceUnit}`;
  if (activity.durationS == null || activity.durationS <= 0) {
    return distance;
  }
  const average = format.average(Number(activity.distanceM), activity.durationS, activity.sportType);
  return `${distance} · ${average} ${format.speedUnit(activity.sportType)}`;
}

export function createGpsEntry(spec: GpsEntrySpec): GpsCatalogEntry {
  return {
    code: spec.code,
    label: spec.label,
    family: spec.family,
    icon: spec.icon,
    appearance: spec.appearance,
    tagline: spec.tagline,
    trackingMode: 'gps',
    maxGpsSpeedKmh: spec.maxGpsSpeedKmh,
    hero: spec.hero ?? 'speed',
    hasSpeed: true,
    metricsSchema: spec.metricsSchema ?? gpsMetricsBase,
    headline: distanceHeadline,
    statsTotals: gpsStatsTotals,
  };
}
