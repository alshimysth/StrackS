/**
 * Walking. A walker's mental model: speed (km/h) rather than pace, which the per-sport
 * display preference carries. Mirrors `WalkingPlugin.java`.
 */
import { z } from 'zod';

import { colors } from '../../design-system/theme';
import { createGpsEntry } from '../shared/gps-catalog';

/** Mirror of WalkingPlugin.MAX_SPEED_KMH (backend). */
const MAX_GPS_SPEED_KMH = 12;

export const walkingEntry = createGpsEntry({
  code: 'walking',
  label: 'Marche',
  family: 'walking',
  icon: 'sport-walk',
  appearance: { label: 'Marche', color: colors.volt700, tint: colors.volt100 },
  tagline: 'GPS · carte · vitesse',
  maxGpsSpeedKmh: MAX_GPS_SPEED_KMH,
  metricsSchema: z.object({
    schemaVersion: z.literal(1),
    avgSpeedKmh: z.number().nonnegative().optional(),
    elevationGainM: z.number().nonnegative().optional(),
    elevationLossM: z.number().nonnegative().optional(),
  }),
});
