/**
 * Ligne de réglage : un libellé, une aide facultative, et un choix par puces (#7).
 *
 * Le choix est appliqué immédiatement — pas de bouton « Enregistrer ». Un réglage
 * d'affichage se juge en le voyant : l'unité change sous les yeux de l'utilisateur,
 * ce qui vaut mieux que n'importe quelle explication.
 */
import React from 'react';

import { spacing, typography } from '../theme';
import { useTheme } from '../use-theme';
import { FilterChips, type ChipOption } from './FilterChips';
import { StyleSheet, Text, View } from 'react-native';

interface Props<T extends string> {
  label: string;
  helper?: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

export function SettingRow<T extends string>({
  label,
  helper,
  options,
  value,
  onChange,
  testID,
}: Props<T>) {
  const theme = useTheme();
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[typography.label, { color: theme.textSecondary }]}>{label}</Text>
      {helper != null && (
        <Text style={[typography.caption, { color: theme.textTertiary }]}>{helper}</Text>
      )}
      <FilterChips options={options} value={value} onChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
});
