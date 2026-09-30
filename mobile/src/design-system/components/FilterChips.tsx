/**
 * FilterChips: a row of single-selection chips.
 *
 * Always one selected value ("Tous" is one of them): a "no active filter" state distinct
 * from the "Tous filter" would give two ways of saying the same thing, and the screen
 * would have to guess which one shows what.
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
  /** Blocks selection, while a save is in flight for instance. */
  disabled?: boolean;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
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
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            // 44 px touch area (#42) without changing the drawing: the chip is 32 px high,
            // the area extends 6 px above and below.
            hitSlop={CHIP_HIT_SLOP}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? theme.textPrimary : theme.surfaceCard,
                borderColor: selected ? theme.textPrimary : theme.borderSubtle,
                opacity: disabled ? 0.5 : 1,
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

const CHIP_HIT_SLOP = { top: 6, bottom: 6 } as const;

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    // Horizontally, the touch margin would overlap the neighbouring chip: the chip itself
    // reaches 44 px ("2", "3" in the goals).
    minWidth: 44,
    alignItems: 'center',
  },
});
