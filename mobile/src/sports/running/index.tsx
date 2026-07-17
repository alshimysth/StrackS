/**
 * Module course à pied. TrackingScreen/SummaryPanel sont des placeholders
 * jusqu'aux Epics 3/4 (moteur de séance + carte) — le manifeste et les
 * métriques dérivées sont, eux, définitifs.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { formatPace } from './format';
import type { Activity } from '../../types/api';
import type { LiveMetric, SessionState, SportModule } from '../types';

const metricsSchema = z.object({
  schemaVersion: z.literal(1),
  avgPaceSecPerKm: z.number().nonnegative().optional(),
  elevationGainM: z.number().nonnegative().optional(),
  elevationLossM: z.number().nonnegative().optional(),
  splits: z.array(z.object({ km: z.number(), paceSecPerKm: z.number() })).optional(),
});

function TrackingScreen() {
  return (
    <View>
      <Text>Tracking course — Epic 3/4 (carte + métriques live)</Text>
    </View>
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
  TrackingScreen,
  SummaryPanel,
  deriveLiveMetrics,
  metricsSchema,
};
