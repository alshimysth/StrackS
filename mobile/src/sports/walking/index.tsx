/**
 * Module marche. Mental model marcheur : vitesse (km/h) plutôt qu'allure.
 * Partage l'écran et le moteur de séance via core/ — zéro copier-coller.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { SessionTrackingScreen } from '../../core/session/SessionTrackingScreen';
import { formatDuration, formatKm } from '../running/format';
import type { Activity } from '../../types/api';
import type { LiveMetric, SessionState, SportModule } from '../types';

/** Miroir de WalkingPlugin.MAX_SPEED_KMH (backend). */
const MAX_GPS_SPEED_KMH = 12;

const metricsSchema = z.object({
  schemaVersion: z.literal(1),
  avgSpeedKmh: z.number().nonnegative().optional(),
  elevationGainM: z.number().nonnegative().optional(),
  elevationLossM: z.number().nonnegative().optional(),
});

function kmh(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

function TrackingScreen() {
  return (
    <SessionTrackingScreen
      sportCode="walking"
      hero={(s) => ({ label: 'Vitesse', value: kmh(s.smoothedSpeedMs * 3.6), unit: 'km/h' })}
      grid={(s) => [
        { label: 'Distance', value: formatKm(s.distanceM), unit: 'km' },
        { label: 'Durée', value: formatDuration(s.elapsedS) },
        {
          label: 'Vitesse moy.',
          value: s.elapsedS > 0 ? kmh((s.distanceM / s.elapsedS) * 3.6) : '—',
          unit: 'km/h',
        },
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
  const speed = metrics.success ? metrics.data.avgSpeedKmh : undefined;
  return (
    <View>
      <Text>Vitesse moyenne : {speed != null ? `${speed} km/h` : '—'}</Text>
      <Text>Durée : {activity.durationS != null ? formatDuration(activity.durationS) : '—'}</Text>
    </View>
  );
}

function deriveLiveMetrics(session: SessionState): LiveMetric[] {
  return [
    { label: 'Vitesse', value: (session.smoothedSpeedMs * 3.6).toFixed(1), unit: 'km/h' },
    { label: 'Distance', value: (session.distanceM / 1000).toFixed(2), unit: 'km' },
    { label: 'D+', value: String(Math.round(session.elevationGainM)), unit: 'm' },
  ];
}

export const walkingModule: SportModule = {
  code: 'walking',
  label: 'Marche',
  usesGps: true,
  maxGpsSpeedKmh: MAX_GPS_SPEED_KMH,
  TrackingScreen,
  SummaryPanel,
  deriveLiveMetrics,
  metricsSchema,
};
