/**
 * Module course à pied. TrackingScreen = écran partagé du moteur de séance
 * (transposé de screens/tracking-running.html) configuré mental model
 * coureur : allure en héro, grille distance/durée/allure moy./dénivelé.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { useFormat } from '../../core/format/use-format';
import { formatDistance, formatElevation, formatSpeed } from '../../core/format/units';
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

function TrackingScreen() {
  // Le formateur est capturé ici, dans le composant : `hero` et `grid` sont de simples
  // fonctions passées à l'écran générique, elles ne peuvent pas appeler de hook.
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
  // `avgPaceSecPerKm` est une allure métrique venue du serveur : on repasse par la
  // vitesse SI pour que la préférence d'unité s'applique aussi ici.
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
 * Métriques dérivées hors composant : pas de hook disponible ici, donc pas de
 * préférence. Les valeurs sont en métrique — c'est un point d'entrée technique
 * (aucun écran ne l'utilise aujourd'hui), pas de l'affichage utilisateur.
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
  usesGps: true,
  maxGpsSpeedKmh: MAX_GPS_SPEED_KMH,
  TrackingScreen,
  SummaryPanel,
  deriveLiveMetrics,
  metricsSchema,
};
