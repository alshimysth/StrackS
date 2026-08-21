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
  /**
   * Évolution par rapport à la période précédente (#24), déjà formatée et signée.
   * Absente quand la comparaison n'a pas de sens — repartir de zéro n'est pas
   * « +100 % » — auquel cas la carte n'affiche rien plutôt qu'un chiffre inventé.
   */
  delta?: string | null;
  /** Une hausse est-elle une bonne nouvelle ? Faux pour un temps de récupération. */
  deltaIsGood?: boolean;
  style?: ViewStyle;
}

export function StatCard({
  label,
  value,
  unit,
  emphasis = 'lg',
  delta,
  deltaIsGood = true,
  style,
}: Props) {
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
      {delta != null && (
        <Text style={[styles.delta, { color: deltaColor(delta, deltaIsGood, theme) }]}>
          {delta}
        </Text>
      )}
    </View>
  );
}

/**
 * La couleur dit la direction croisée avec ce qui est souhaitable — pas le signe
 * seul. Une évolution nulle reste neutre : la teindre en vert ou en rouge
 * suggérerait un jugement là où il n'y a rien à signaler.
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
