/**
 * SportBadge: RN port of components/badges/SportBadge.jsx (Claude Design).
 *
 * Extensible: a sport module declares its own appearance (label, colour, tint) and the
 * core passes it in; `sportColors` (theme.ts) stays the fallback for the historical
 * sports and the neutral grey covers whatever nobody described.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, sportColors } from '../theme';

export interface SportAppearance {
  label: string;
  color: string;
  tint: string;
}

interface Props {
  sport: string;
  /** Appearance resolved by the caller (usually from the sport module); overrides the theme table. */
  appearance?: SportAppearance;
  variant?: 'filled' | 'outline';
  size?: 'md' | 'sm';
}

export function SportBadge({ sport, appearance, variant = 'filled', size = 'md' }: Props) {
  const def = appearance ??
    sportColors[sport] ?? {
      label: sport,
      color: colors.neutral600,
      tint: colors.neutral100,
    };
  const small = size === 'sm';

  return (
    <View
      style={[
        styles.base,
        small ? styles.small : styles.medium,
        variant === 'filled'
          ? { backgroundColor: def.tint }
          : { borderWidth: 2, borderColor: def.color },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: def.color }]} />
      <Text style={[styles.label, small && styles.labelSmall, { color: def.color }]}>
        {def.label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radius.pill,
  },
  medium: { paddingVertical: 6, paddingHorizontal: 14 },
  small: { paddingVertical: 4, paddingHorizontal: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.7 },
  labelSmall: { fontSize: 11 },
});
