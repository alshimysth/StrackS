/**
 * StatCard: RN port of components/data/StatCard.jsx (Claude Design).
 * emphasis="xl": the screen's hero metric; "lg": grid of secondary stats.
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
  /**
   * Change from the previous period (#24), already formatted and signed. Absent when the
   * comparison is meaningless (starting from zero isn't "+100 %"), in which case the card
   * shows nothing rather than a made-up number.
   */
  delta?: string | null;
  /** Is an increase good news? False for a recovery time. */
  deltaIsGood?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function StatCard({
  label,
  value,
  unit,
  emphasis = 'lg',
  delta,
  deltaIsGood = true,
  style,
  testID,
}: Props) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      // Read as one (#42): "Distance, 5,20 km" rather than three fragments the screen
      // reader would announce separately.
      accessible
      accessibilityLabel={[label, value, unit, delta].filter(Boolean).join(', ')}
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
          // Follows the system text size (#42), capped: a 40 px number enlarged three
          // times would overflow its card and become unreadable.
          maxFontSizeMultiplier={1.4}
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
      {delta != null && (
        <Text style={[styles.delta, { color: deltaColor(delta, deltaIsGood, theme) }]}>
          {delta}
        </Text>
      )}
    </View>
  );
}

/**
 * The colour states the direction crossed with what's desirable, not the sign alone. A
 * zero change stays neutral: tinting it green or red would suggest a judgement where
 * there's nothing to report.
 */
function deltaColor(
  delta: string,
  isGood: boolean,
  theme: ReturnType<typeof useTheme>,
): string {
  if (delta === '=') {
    return theme.textSecondary;
  }
  const rising = delta.startsWith('+');
  return rising === isGood ? theme.textSuccess : theme.textSecondary;
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
  delta: { ...typography.caption, marginTop: 5 },
});
