/**
 * Running family: road, trail, treadmill. Road and trail run the GPS engine (a trail
 * runner reads the climb first); the treadmill is a timed sport whose distance is read
 * on the machine. Mirrors `sports/running/*.java`.
 */
import { z } from 'zod';

import { colors } from '../../design-system/theme';
import { createGpsEntry } from '../shared/gps-catalog';
import { createMachineEntry, distanceField, machineSchemas } from '../shared/machine-catalog';

const FAMILY = 'running';
const appearance = { label: 'Course', color: colors.primary500, tint: colors.primary100 };

/** Mirror of RunningPlugin.MAX_SPEED_KMH (backend). */
const RUNNING_MAX_SPEED_KMH = 25;
/** Mirror of TrailRunningPlugin.MAX_SPEED_KMH (backend). */
const TRAIL_MAX_SPEED_KMH = 30;

export const runningEntry = createGpsEntry({
  code: 'running',
  label: 'Course à pied',
  family: FAMILY,
  icon: 'sport-run',
  appearance,
  tagline: 'GPS · carte · allure · splits',
  maxGpsSpeedKmh: RUNNING_MAX_SPEED_KMH,
  metricsSchema: z.object({
    schemaVersion: z.literal(1),
    avgPaceSecPerKm: z.number().nonnegative().optional(),
    elevationGainM: z.number().nonnegative().optional(),
    elevationLossM: z.number().nonnegative().optional(),
    splits: z.array(z.object({ km: z.number(), paceSecPerKm: z.number() })).optional(),
  }),
});

export const trailRunningEntry = createGpsEntry({
  code: 'trail_running',
  label: 'Trail',
  family: FAMILY,
  icon: 'sport-trail',
  appearance: { ...appearance, label: 'Trail' },
  tagline: 'GPS · dénivelé en tête · D+ par km',
  maxGpsSpeedKmh: TRAIL_MAX_SPEED_KMH,
  hero: 'elevation',
  metricsSchema: z.object({
    schemaVersion: z.literal(1),
    avgPaceSecPerKm: z.number().nonnegative().optional(),
    elevationGainM: z.number().nonnegative().optional(),
    elevationLossM: z.number().nonnegative().optional(),
    elevationGainPerKmM: z.number().nonnegative().optional(),
    splits: z.array(z.object({ km: z.number(), paceSecPerKm: z.number() })).optional(),
  }),
});

export const treadmillRunningEntry = createMachineEntry({
  code: 'treadmill_running',
  label: 'Tapis de course',
  family: FAMILY,
  icon: 'sport-machine',
  appearance: { ...appearance, label: 'Tapis' },
  tagline: 'Chrono · distance relevée sur le tapis',
  fields: [distanceField(), { key: 'inclinePct', label: 'Inclinaison', unit: '%', min: 0, max: 40 }],
  metricsSchema: machineSchemas.treadmill,
  summaryRows: (metrics, activity, format) => {
    const rows: [string, string][] = [];
    const pace = typeof metrics.avgPaceSecPerKm === 'number' ? metrics.avgPaceSecPerKm : 0;
    if (pace > 0) {
      const label = format.speedDisplayFor(activity.sportType) === 'pace' ? 'Allure moyenne' : 'Vitesse moyenne';
      rows.push([label, `${format.speed(1000 / pace, activity.sportType)} ${format.speedUnit(activity.sportType)}`]);
    }
    if (typeof metrics.inclinePct === 'number') {
      rows.push(['Inclinaison', `${metrics.inclinePct} %`]);
    }
    return rows;
  },
});
