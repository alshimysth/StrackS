/**
 * Screens of a geolocated sport, built from its catalog entry: a hero (pace or speed), a
 * 2×2 grid on the shared tracking screen, and a summary with the average, the top speed
 * and the elevation.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useFormat } from '../../core/format/use-format';
import { SessionTrackingScreen } from '../../core/session/SessionTrackingScreen';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import type { Activity } from '../../types/api';
import type { SportScreens } from '../types';
import type { GpsCatalogEntry, GpsMetrics } from './gps-catalog';

export function createGpsScreens(entry: GpsCatalogEntry): SportScreens {
  function TrackingScreen() {
    // The formatter is captured here, in the component: `hero` and `grid` are plain
    // functions passed to the generic screen, they can't call a hook.
    const format = useFormat();
    const speedUnit = format.speedUnit(entry.code);
    const speedLabel = format.speedDisplayFor(entry.code) === 'pace' ? 'Allure' : 'Vitesse';

    const speedMetric = (s: { smoothedSpeedMs: number }) => ({
      label: speedLabel,
      value: format.speed(s.smoothedSpeedMs, entry.code),
      unit: speedUnit,
    });
    const elevationMetric = (s: { elevationGainM: number; elevationLossM: number }) => ({
      label: 'Dénivelé',
      value: `▲${format.elevation(s.elevationGainM)} ▼${format.elevation(s.elevationLossM)}`,
      unit: format.elevationUnit,
    });

    return (
      <SessionTrackingScreen
        sportCode={entry.code}
        appearance={entry.appearance}
        hero={(s) => (entry.hero === 'elevation' ? elevationMetric(s) : speedMetric(s))}
        grid={(s) => [
          { label: 'Distance', value: format.distance(s.distanceM), unit: format.distanceUnit },
          { label: 'Durée', value: format.duration(s.elapsedS) },
          {
            label: `${speedLabel} moy.`,
            value: format.average(s.distanceM, s.elapsedS, entry.code),
            unit: speedUnit,
          },
          entry.hero === 'elevation' ? speedMetric(s) : elevationMetric(s),
        ]}
      />
    );
  }

  function SummaryPanel({ activity }: { activity: Activity }) {
    const theme = useTheme();
    const format = useFormat();
    const parsed = entry.metricsSchema.safeParse(activity.metrics);
    const metrics: GpsMetrics = parsed.success ? (parsed.data as GpsMetrics) : { schemaVersion: 1 };
    // The server writes a metric pace or a km/h speed: we go back through the SI speed so
    // that the unit preference applies here too.
    const speedMs =
      metrics.avgPaceSecPerKm != null && metrics.avgPaceSecPerKm > 0
        ? 1000 / metrics.avgPaceSecPerKm
        : metrics.avgSpeedKmh != null
          ? metrics.avgSpeedKmh / 3.6
          : 0;
    const averageLabel = format.speedDisplayFor(entry.code) === 'pace' ? 'Allure moyenne' : 'Vitesse moyenne';
    const rows: [string, string][] = [
      [averageLabel, `${format.speed(speedMs, entry.code)} ${format.speedUnit(entry.code)}`],
    ];
    if (metrics.maxSpeedKmh != null && metrics.maxSpeedKmh > 0) {
      rows.push([
        'Vitesse max',
        `${format.speed(metrics.maxSpeedKmh / 3.6, entry.code)} ${format.speedUnit(entry.code)}`,
      ]);
    }
    if (metrics.elevationGainM != null || metrics.elevationLossM != null) {
      rows.push([
        'Dénivelé',
        `▲${format.elevation(metrics.elevationGainM ?? 0)} ▼${format.elevation(metrics.elevationLossM ?? 0)} ${format.elevationUnit}`,
      ]);
    }
    if (metrics.elevationGainPerKmM != null) {
      rows.push(['D+ par km', `${format.elevation(metrics.elevationGainPerKmM)} ${format.elevationUnit}`]);
    }
    return <SummaryRows rows={rows} textPrimary={theme.textPrimary} textSecondary={theme.textSecondary} />;
  }

  return { TrackingScreen, SummaryPanel };
}

/** Label / value rows, shared by the summary panels of the generated modules. */
export function SummaryRows({
  rows,
  textPrimary,
  textSecondary,
}: {
  rows: [string, string][];
  textPrimary: string;
  textSecondary: string;
}) {
  return (
    <View style={styles.rows}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={[typography.body, { color: textSecondary }]}>{label}</Text>
          <Text style={[typography.bodyLg, { color: textPrimary }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
