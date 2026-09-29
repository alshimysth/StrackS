/**
 * Setting row: a label, an optional helper, and a chip choice (#7).
 *
 * The choice applies immediately, with no "Enregistrer" button. A display setting is
 * judged by seeing it: the unit changes before the user's eyes, which beats any
 * explanation.
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
  /** Greyed out while a save is in flight. */
  disabled?: boolean;
  testID?: string;
}

export function SettingRow<T extends string>({
  label,
  helper,
  options,
  value,
  onChange,
  disabled = false,
  testID,
}: Props<T>) {
  const theme = useTheme();
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[typography.label, { color: theme.textSecondary }]}>{label}</Text>
      {helper != null && (
        <Text style={[typography.caption, { color: theme.textSecondary }]}>{helper}</Text>
      )}
      <FilterChips
        options={options}
        value={value}
        onChange={onChange}
        accessibilityLabel={label}
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
});
