/**
 * FilterChips — rangée de puces à sélection unique.
 *
 * Toujours une valeur sélectionnée (« Tous » en fait partie) : un état « aucun filtre
 * actif » distinct de « filtre Tous » donnerait deux façons d'exprimer la même chose,
 * et l'écran devrait deviner laquelle affiche quoi.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { radius, spacing, typography } from '../theme';
import { useTheme } from '../use-theme';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={`chip-${option.value}`}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? theme.textPrimary : theme.surfaceCard,
                borderColor: selected ? theme.textPrimary : theme.borderSubtle,
              },
            ]}
          >
            <Text
              style={[
                typography.caption,
                { color: selected ? theme.textInverse : theme.textSecondary },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
