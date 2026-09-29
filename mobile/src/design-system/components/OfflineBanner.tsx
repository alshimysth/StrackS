/**
 * OfflineBanner: a discreet banner above data served from the cache.
 *
 * Story #27, DoD: "no stale data shown without an indication". The banner therefore
 * carries the DATE of the last sync, not just the fact of being offline: "yesterday 6 pm"
 * and "three weeks ago" don't call for the same trust, and only the date tells them
 * apart.
 *
 * Deliberately neutral tone (warning, not error): browsing sessions offline is an
 * intended use, not an incident.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';
import { Icon } from './Icon';
import { useTheme } from '../use-theme';

interface Props {
  /** Timestamp of the last server response, in epoch ms. */
  lastUpdatedAt?: number;
  testID?: string;
}

/** Short relative wording, without an i18n dependency (#43 not decided). */
export function formatFreshness(lastUpdatedAt: number, now: number = Date.now()): string {
  const minutes = Math.floor((now - lastUpdatedAt) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} jours`;
}

export function OfflineBanner({ lastUpdatedAt, testID = 'offline-banner' }: Props) {
  const theme = useTheme();
  const freshness =
    lastUpdatedAt != null && lastUpdatedAt > 0 ? formatFreshness(lastUpdatedAt) : null;

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: colors.warning100 }]}
    >
      <Icon name="state-offline" color={colors.warning600} size="sm" />
      {/* Dark text on a light alert background: warning600 on warning100 doesn't exceed
          2.6:1 (#42). The decorative icon keeps the alert colour. */}
      <Text style={[typography.caption, { color: colors.neutral900 }]}>
        Hors ligne
        {freshness != null ? ` · données synchronisées ${freshness}` : ' · données en cache'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
