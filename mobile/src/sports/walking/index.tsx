/**
 * Module marche. Mental model marcheur : vitesse (km/h) plutôt qu'allure.
 * Partage les formats et le moteur GPS via core/ — zéro copier-coller.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { formatDuration } from '../running/format';
import type { Activity } from '../../types/api';
import type { LiveMetric, SessionState, SportModule } from '../types';

const metricsSchema = z.object({
  schemaVersion: z.literal(1),
  avgSpeedKmh: z.number().nonnegative().optional(),
  elevationGainM: z.number().nonnegative().optional(),
  elevationLossM: z.number().nonnegative().optional(),
});

function TrackingScreen() {
  return (
    <View>
      <Text>Tracking marche — Epic 3/4 (carte + métriques live)</Text>
    </View>
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
  TrackingScreen,
  SummaryPanel,
  deriveLiveMetrics,
  metricsSchema,
};
