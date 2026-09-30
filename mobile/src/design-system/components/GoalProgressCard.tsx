/**
 * Progress on the weekly goal, shown on the home screen (#35).
 *
 * Renders NOTHING when no goal is set, as the DoD explicitly requires: "no goal set = no
 * stray UI". The caller decides, but the component also protects itself.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GoalProgress } from '../../core/preferences/weekly-goal';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { useTheme } from '../use-theme';

interface Props {
  label: string;
  /** Value already formatted by the caller (units, plurals). */
  valueLabel: string;
  progress: GoalProgress;
  testID?: string;
}

export function GoalProgressCard({ label, valueLabel, progress, testID }: Props) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.card, shadows.card, { backgroundColor: theme.surfaceCard, borderColor: theme.borderSubtle }]}
    >
      <View style={styles.header}>
        <Text style={[typography.label, { color: theme.textSecondary }]}>{label}</Text>
        <Text style={[typography.label, { color: progress.reached ? theme.textSuccess : theme.textSecondary }]}>
          {Math.round(progress.rawRatio * 100)} %
        </Text>
      </View>
      <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>{valueLabel}</Text>
      <View style={[styles.track, { backgroundColor: theme.surfaceSunken }]}>
        <View
          testID={testID != null ? `${testID}-bar` : undefined}
          style={[
            styles.bar,
            {
              width: `${progress.ratio * 100}%`,
              // Volt is reserved for celebrations: it only appears once the goal is
              // reached, never during progress.
              backgroundColor: progress.reached ? colors.volt900 : colors.primary500,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.base, gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: 8, borderRadius: radius.pill },
});
