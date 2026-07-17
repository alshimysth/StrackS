/**
 * SportBadge — transposition RN de components/badges/SportBadge.jsx (Claude Design).
 * Extensible : un nouveau sport ajoute son entrée dans sportColors (theme.ts),
 * aucun autre composant ne change.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, sportColors } from '../theme';

interface Props {
  sport: string;
  variant?: 'filled' | 'outline';
  size?: 'md' | 'sm';
}

export function SportBadge({ sport, variant = 'filled', size = 'md' }: Props) {
  const def = sportColors[sport] ?? {
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
