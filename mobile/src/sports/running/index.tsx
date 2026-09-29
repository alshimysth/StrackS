/**
 * Running module. TrackingScreen = the session engine's shared screen (ported from
 * screens/tracking-running.html) set up for a runner's mental model: pace as hero,
 * distance/duration/average pace/elevation grid.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { useFormat } from '../../core/format/use-format';
import { formatDistance, formatElevation, formatSpeed } from '../../core/format/units';
import { SessionTrackingScreen } from '../../core/session/SessionTrackingScreen';
import type { Activity } from '../../types/api';
import type { LiveMetric, SessionState, SportModule } from '../types';

/** Mirror of RunningPlugin.MAX_SPEED_KMH (backend). */
const MAX_GPS_SPEED_KMH = 25;

const metricsSchema = z.object({
  schemaVersion: z.literal(1),
  avgPaceSecPerKm: z.number().nonnegative().optional(),
  elevationGainM: z.number().nonnegative().optional(),
  elevationLossM: z.number().nonnegative().optional(),
  splits: z.array(z.object({ km: z.number(), paceSecPerKm: z.number() })).optional(),
});

function TrackingScreen() {
  // The formatter is captured here, in the component: `hero` and `grid` are plain
  // functions passed to the generic screen, they can't call a hook.
  const format = useFormat();
  const speedUnit = format.speedUnit('running');

  return (
    <SessionTrackingScreen
      sportCode="running"
      hero={(s) => ({
        label: format.speedDisplayFor('running') === 'pace' ? 'Allure' : 'Vitesse',
        value: format.speed(s.smoothedSpeedMs, 'running'),
        unit: speedUnit,
      })}
      grid={(s) => [
        { label: 'Distance', value: format.distance(s.distanceM), unit: format.distanceUnit },
        { label: 'Durée', value: format.duration(s.elapsedS) },
        {
          label: format.speedDisplayFor('running') === 'pace' ? 'Allure moy.' : 'Vitesse moy.',
          value: format.average(s.distanceM, s.elapsedS, 'running'),
          unit: speedUnit,
        },
        {
          label: 'Dénivelé',
          value: `▲${format.elevation(s.elevationGainM)} ▼${format.elevation(s.elevationLossM)}`,
          unit: format.elevationUnit,
        },
      ]}
    />
  );
}

function SummaryPanel({ activity }: { activity: Activity }) {
  const format = useFormat();
  const metrics = metricsSchema.safeParse(activity.metrics);
  const paceSecPerKm = metrics.success ? metrics.data.avgPaceSecPerKm : undefined;
  // `avgPaceSecPerKm` is a metric pace coming from the server: we go back through the SI
  // speed so that the unit preference applies here too.
  const speedMs = paceSecPerKm != null && paceSecPerKm > 0 ? 1000 / paceSecPerKm : 0;
  const label = format.speedDisplayFor('running') === 'pace' ? 'Allure moyenne' : 'Vitesse moyenne';
  return (
    <View>
      <Text>
        {label} : {format.speed(speedMs, 'running')} {format.speedUnit('running')}
      </Text>
    </View>
  );
}

/**
 * Derived metrics outside a component: no hook available here, hence no preference.
 * Values are metric: it's a technical entry point (no screen uses it today), not user
 * display.
 */
function deriveLiveMetrics(session: SessionState): LiveMetric[] {
  return [
    {
      label: 'Allure',
      value: formatSpeed(session.smoothedSpeedMs, 'metric', 'pace'),
      unit: '/km',
    },
    { label: 'Distance', value: formatDistance(session.distanceM, 'metric'), unit: 'km' },
    { label: 'D+', value: formatElevation(session.elevationGainM, 'metric'), unit: 'm' },
  ];
}

export const runningModule: SportModule = {
  code: 'running',
  label: 'Course à pied',
  icon: 'sport-run',
  usesGps: true,
  maxGpsSpeedKmh: MAX_GPS_SPEED_KMH,
  TrackingScreen,
  SummaryPanel,
  deriveLiveMetrics,
  metricsSchema,
};
