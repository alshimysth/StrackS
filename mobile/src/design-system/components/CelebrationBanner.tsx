/**
 * CelebrationBanner — bandeau « volt » du résumé de fin de séance (#22).
 *
 * Le volt est réservé aux célébrations (direction « Volt Performance ») : l'afficher à
 * chaque séance le viderait de son sens. Il faut donc une raison, et cette raison doit
 * être **certaine** — célébrer un record qui n'en est pas un est pire que ne rien
 * célébrer.
 *
 * Trois raisons, toutes calculées côté serveur sur des données complètes : la première
 * séance d'un sport, un record personnel (#61, `/stats/records`), un objectif
 * hebdomadaire franchi (#35). Une seule s'affiche à la fois — voir l'écran de résumé.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export type CelebrationReason = 'first-session' | 'personal-record' | 'weekly-goal';

interface Props {
  reason: CelebrationReason;
  sportLabel: string;
  /** Libellés des records battus, rédigés par le serveur (`personal-record` seulement). */
  records?: string[];
  testID?: string;
}

/** « Plus longue distance » + « Plus longue séance » → « plus longue distance et plus longue séance ». */
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
  // #61 : le serveur a désigné cette séance comme détentrice, sur tout l'historique.
  'personal-record': (sport, records) => ({
    title: 'Nouveau record !',
    message: `Ta ${joinRecords(records)} en ${sport.toLowerCase()}. Rien de ce que tu as fait avant ne va plus loin.`,
  }),
  // Déclencheur ajouté par #35 : jusque-là, le volt n'avait aucune raison d'exister.
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
