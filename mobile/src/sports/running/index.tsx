/**
 * Module course à pied. TrackingScreen = écran partagé du moteur de séance
 * (transposé de screens/tracking-running.html) configuré mental model
 * coureur : allure en héro, grille distance/durée/allure moy./dénivelé.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { formatDuration, formatKm, formatPace } from './format';
import { SessionTrackingScreen } from '../../core/session/SessionTrackingScreen';
import type { Activity } from '../../types/api';
import type { LiveMetric, SessionState, SportModule } from '../types';

/** Miroir de RunningPlugin.MAX_SPEED_KMH (backend). */
const MAX_GPS_SPEED_KMH = 25;

const metricsSchema = z.object({
  schemaVersion: z.literal(1),
  avgPaceSecPerKm: z.number().nonnegative().optional(),
  elevationGainM: z.number().nonnegative().optional(),
  elevationLossM: z.number().nonnegative().optional(),
  splits: z.array(z.object({ km: z.number(), paceSecPerKm: z.number() })).optional(),
});

function instantPace(session: SessionState): string {
  return session.smoothedSpeedMs > 0.3 ? formatPace(1000 / session.smoothedSpeedMs) : '—';
}

function averagePace(session: SessionState): string {
  return session.distanceM > 50 && session.elapsedS > 0
    ? formatPace(session.elapsedS / (session.distanceM / 1000))
    : '—';
}

function TrackingScreen() {
  return (
    <SessionTrackingScreen
      sportCode="running"
      hero={(s) => ({ label: 'Allure', value: instantPace(s), unit: '/km' })}
      grid={(s) => [
        { label: 'Distance', value: formatKm(s.distanceM), unit: 'km' },
        { label: 'Durée', value: formatDuration(s.elapsedS) },
        { label: 'Allure moy.', value: averagePace(s), unit: '/km' },
        {
          label: 'Dénivelé',
          value: `▲${Math.round(s.elevationGainM)} ▼${Math.round(s.elevationLossM)}`,
          unit: 'm',
        },
      ]}
    />
  );
}

function SummaryPanel({ activity }: { activity: Activity }) {
  const metrics = metricsSchema.safeParse(activity.metrics);
  const pace = metrics.success ? metrics.data.avgPaceSecPerKm : undefined;
  return (
    <View>
      <Text>Allure moyenne : {pace != null ? formatPace(pace) : '—'}</Text>
    </View>
  );
}

function deriveLiveMetrics(session: SessionState): LiveMetric[] {
  const paceSecPerKm =
    session.smoothedSpeedMs > 0.3 ? 1000 / session.smoothedSpeedMs : null;
  return [
    { label: 'Allure', value: paceSecPerKm ? formatPace(paceSecPerKm) : '—', unit: '/km' },
    { label: 'Distance', value: (session.distanceM / 1000).toFixed(2), unit: 'km' },
    { label: 'D+', value: String(Math.round(session.elevationGainM)), unit: 'm' },
  ];
}

export const runningModule: SportModule = {
  code: 'running',
  label: 'Course à pied',
  usesGps: true,
  maxGpsSpeedKmh: MAX_GPS_SPEED_KMH,
  TrackingScreen,
  SummaryPanel,
  deriveLiveMetrics,
  metricsSchema,
};
