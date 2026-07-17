/**
 * StatCard — transposition RN de components/data/StatCard.jsx (Claude Design).
 * emphasis="xl" : métrique héro de l'écran ; "lg" : grille de stats secondaires.
 */
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '../use-theme';
import { fonts, radius, shadows, spacing, typography } from '../theme';

interface Props {
  label: string;
  value: string;
  unit?: string;
  emphasis?: 'xl' | 'lg';
  style?: ViewStyle;
}

export function StatCard({ label, value, unit, emphasis = 'lg', style }: Props) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        shadows.card,
        { backgroundColor: theme.surfaceCard, borderColor: theme.borderSubtle },
        style,
      ]}
    >
      <Text style={[typography.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.valueRow}>
        <Text
          style={[
            emphasis === 'xl' ? typography.statXl : typography.statLg,
            { color: theme.textPrimary },
          ]}
        >
          {value}
        </Text>
        {unit != null && (
          <Text style={[styles.unit, { color: theme.textSecondary }]}>{unit}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 6,
  },
  unit: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
