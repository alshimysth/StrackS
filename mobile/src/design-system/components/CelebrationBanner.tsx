/**
 * CelebrationBanner: the end-of-session summary's "volt" banner (#22).
 *
 * Volt is reserved for celebrations ("Volt Performance" direction): showing it on every
 * session would empty it of meaning. So there must be a reason, and that reason must be
 * **certain**: celebrating a record that isn't one is worse than celebrating nothing.
 *
 * Three reasons, all computed on the server from complete data: a sport's first session,
 * a personal record (#61, `/stats/records`), a weekly goal crossed (#35). Only one shows
 * at a time; see the summary screen.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export type CelebrationReason = 'first-session' | 'personal-record' | 'weekly-goal';

interface Props {
  reason: CelebrationReason;
  sportLabel: string;
  /** Labels of the broken records, written by the server (`personal-record` only). */
  records?: string[];
  testID?: string;
}

/** "Plus longue distance" + "Plus longue séance" → "plus longue distance et plus longue séance". */
function joinRecords(labels: string[]): string {
  const lower = labels.map((l) => l.charAt(0).toLowerCase() + l.slice(1));
  return lower.length <= 1 ? (lower[0] ?? '') : `${lower.slice(0, -1).join(', ')} et ${lower[lower.length - 1]}`;
}

const COPY: Record<
  CelebrationReason,
  (sport: string, records: string[]) => { title: string; message: string }
> = {
  'first-session': (sport) => ({
    title: 'Première séance !',
    message: `Ta première sortie en ${sport.toLowerCase()} est enregistrée. La suite se construit là-dessus.`,
  }),
  // #61: the server designated this session as the holder, over the whole history.
  'personal-record': (sport, records) => ({
    title: 'Nouveau record !',
    message: `Ta ${joinRecords(records)} en ${sport.toLowerCase()}. Rien de ce que tu as fait avant ne va plus loin.`,
  }),
  // Trigger added by #35: until then, volt had no reason to exist.
  'weekly-goal': () => ({
    title: 'Objectif de la semaine atteint !',
    message: 'Cette séance est celle qui fait basculer ta semaine. Le reste est du bonus.',
  }),
};

export function CelebrationBanner({
  reason,
  sportLabel,
  records = [],
  testID = 'celebration-banner',
}: Props) {
  const copy = COPY[reason](sportLabel, records);
  return (
    <View testID={testID} style={[styles.banner, { backgroundColor: colors.volt500 }]}>
      <Text style={[typography.h3, { color: colors.neutral900 }]}>{copy.title}</Text>
      <Text style={[typography.body, { color: colors.neutral900 }]}>{copy.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
});
