/**
 * Cycling family: road, mountain bike, indoor trainer. Mirrors `sports/cycling/*.java`.
 */
import { z } from 'zod';

import { colors } from '../../design-system/theme';
import { createGpsEntry } from '../shared/gps-catalog';
import { createMachineEntry, distanceField, machineSchemas } from '../shared/machine-catalog';

const FAMILY = 'cycling';
const appearance = { label: 'Vélo', color: colors.success600, tint: colors.success100 };

/** Mirror of RoadCyclingPlugin.MAX_SPEED_KMH (backend). */
const ROAD_MAX_SPEED_KMH = 80;
/** Mirror of MountainBikingPlugin.MAX_SPEED_KMH (backend). */
const MTB_MAX_SPEED_KMH = 70;

const outdoorSchema = z.object({
  schemaVersion: z.literal(1),
  avgSpeedKmh: z.number().nonnegative().optional(),
  maxSpeedKmh: z.number().nonnegative().optional(),
  elevationGainM: z.number().nonnegative().optional(),
  elevationLossM: z.number().nonnegative().optional(),
});

export const cyclingEntry = createGpsEntry({
  code: 'cycling',
  label: 'Vélo route',
  family: FAMILY,
  icon: 'sport-bike',
  appearance,
  tagline: 'GPS · carte · vitesse · vitesse max',
  maxGpsSpeedKmh: ROAD_MAX_SPEED_KMH,
  metricsSchema: outdoorSchema,
});

export const mountainBikingEntry = createGpsEntry({
  code: 'mountain_biking',
  label: 'VTT',
  family: FAMILY,
  icon: 'sport-mountain-bike',
  appearance: { ...appearance, label: 'VTT' },
  tagline: 'GPS · dénivelé en tête · vitesse max',
  maxGpsSpeedKmh: MTB_MAX_SPEED_KMH,
  hero: 'elevation',
  metricsSchema: outdoorSchema,
});

export const indoorCyclingEntry = createMachineEntry({
  code: 'indoor_cycling',
  label: "Vélo d'intérieur",
  family: FAMILY,
  icon: 'sport-machine',
  appearance: { ...appearance, label: 'Indoor' },
  tagline: 'Chrono · distance, puissance, cadence relevées',
  fields: [
    // Mirror of IndoorCyclingPlugin: a trainer session may go well past a treadmill's.
    distanceField(500_000),
    { key: 'avgPowerW', label: 'Puissance moyenne', unit: 'W', min: 0, max: 2000 },
    { key: 'avgCadenceRpm', label: 'Cadence moyenne', unit: 'rpm', min: 0, max: 250 },
  ],
  metricsSchema: machineSchemas.indoorCycling,
  summaryRows: (metrics, activity, format) => {
    const rows: [string, string][] = [];
    if (typeof metrics.avgSpeedKmh === 'number' && metrics.avgSpeedKmh > 0) {
      rows.push([
        'Vitesse moyenne',
        `${format.speed(metrics.avgSpeedKmh / 3.6, activity.sportType)} ${format.speedUnit(activity.sportType)}`,
      ]);
    }
    if (typeof metrics.avgPowerW === 'number') {
      rows.push(['Puissance moyenne', `${Math.round(metrics.avgPowerW)} W`]);
    }
    if (typeof metrics.avgCadenceRpm === 'number') {
      rows.push(['Cadence moyenne', `${Math.round(metrics.avgCadenceRpm)} rpm`]);
    }
    return rows;
  },
});
