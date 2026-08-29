/**
 * Module marche. Mental model marcheur : vitesse (km/h) plutôt qu'allure.
 * Partage l'écran et le moteur de séance via core/ — zéro copier-coller.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { SessionTrackingScreen } from '../../core/session/SessionTrackingScreen';
import { useFormat } from '../../core/format/use-format';
import { formatDistance, formatElevation, formatSpeed } from '../../core/format/units';
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

function TrackingScreen() {
  const format = useFormat();
  const speedUnit = format.speedUnit('walking');
  const speedLabel = format.speedDisplayFor('walking') === 'pace' ? 'Allure' : 'Vitesse';

  return (
    <SessionTrackingScreen
      sportCode="walking"
      hero={(s) => ({
        label: speedLabel,
        value: format.speed(s.smoothedSpeedMs, 'walking'),
        unit: speedUnit,
      })}
      grid={(s) => [
        { label: 'Distance', value: format.distance(s.distanceM), unit: format.distanceUnit },
        { label: 'Durée', value: format.duration(s.elapsedS) },
        {
          label: `${speedLabel} moy.`,
          value: format.average(s.distanceM, s.elapsedS, 'walking'),
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
  const speedKmh = metrics.success ? metrics.data.avgSpeedKmh : undefined;
  // Le serveur renvoie des km/h : on repasse en m/s (SI) pour que la préférence
  // d'unité s'applique, plutôt que de recoller « km/h » en dur.
  const speedMs = speedKmh != null ? speedKmh / 3.6 : 0;
  const label = format.speedDisplayFor('walking') === 'pace' ? 'Allure moyenne' : 'Vitesse moyenne';
  return (
    <View>
      <Text>
        {label} : {format.speed(speedMs, 'walking')} {format.speedUnit('walking')}
      </Text>
      <Text>Durée : {activity.durationS != null ? format.duration(activity.durationS) : '—'}</Text>
    </View>
  );
}

/** Voir la note du module course : hors composant, donc métrique par construction. */
function deriveLiveMetrics(session: SessionState): LiveMetric[] {
  return [
    {
      label: 'Vitesse',
      value: formatSpeed(session.smoothedSpeedMs, 'metric', 'speed'),
      unit: 'km/h',
    },
    { label: 'Distance', value: formatDistance(session.distanceM, 'metric'), unit: 'km' },
    { label: 'D+', value: formatElevation(session.elevationGainM, 'metric'), unit: 'm' },
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
