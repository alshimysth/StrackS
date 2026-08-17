/**
 * OfflineBanner — bandeau discret au-dessus de données servies par le cache.
 *
 * Story #27, DoD : « aucune donnée périmée affichée sans indication ». Le bandeau
 * porte donc la DATE de la dernière synchronisation, pas seulement le fait d'être
 * hors ligne — « hier 18 h » et « il y a trois semaines » n'appellent pas la même
 * confiance, et seule la date permet de faire la différence.
 *
 * Ton volontairement neutre (warning, pas error) : consulter ses séances hors ligne
 * est un usage prévu, pas un incident.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';
import { useTheme } from '../use-theme';

interface Props {
  /** Horodatage de la dernière réponse serveur, en ms epoch. */
  lastUpdatedAt?: number;
  testID?: string;
}

/** Formulation relative courte, sans dépendance de i18n (#43 non tranchée). */
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
      <Text style={[typography.caption, { color: colors.warning600 }]}>
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
  },
});
