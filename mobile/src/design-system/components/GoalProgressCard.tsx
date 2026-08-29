/**
 * Progression sur l'objectif hebdomadaire, affichée sur l'accueil (#35).
 *
 * Ne rend RIEN quand aucun objectif n'est défini — la DoD l'exige explicitement :
 * « aucun objectif défini = aucune UI parasite ». C'est l'appelant qui décide, mais
 * le composant se protège aussi lui-même.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GoalProgress } from '../../core/preferences/weekly-goal';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { useTheme } from '../use-theme';

interface Props {
  label: string;
  /** Valeur déjà formatée par l'appelant (unités, pluriels). */
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
              // Le volt est réservé aux célébrations : il n'apparaît qu'une fois
              // l'objectif atteint, jamais pendant la progression.
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
