/**
 * CelebrationBanner — bandeau « volt » du résumé de fin de séance (#22).
 *
 * Le volt est réservé aux célébrations (direction « Volt Performance ») : l'afficher à
 * chaque séance le viderait de son sens. Il faut donc une raison, et cette raison doit
 * être **certaine** — célébrer un record qui n'en est pas un est pire que ne rien
 * célébrer.
 *
 * `first-session` est la seule raison calculable exactement aujourd'hui : elle se lit
 * sur le `total` de l'historique du sport, sans nouvel endpoint. Les records de distance
 * et les objectifs hebdomadaires exigent une agrégation serveur qui n'existe pas encore
 * (Epic 6 / lot H) — d'où le type ouvert plutôt qu'un booléen.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export type CelebrationReason = 'first-session' | 'weekly-goal';

interface Props {
  reason: CelebrationReason;
  sportLabel: string;
  testID?: string;
}

const COPY: Record<CelebrationReason, (sport: string) => { title: string; message: string }> = {
  'first-session': (sport) => ({
    title: 'Première séance !',
    message: `Ta première sortie en ${sport.toLowerCase()} est enregistrée. La suite se construit là-dessus.`,
  }),
  // Déclencheur ajouté par #35 : jusque-là, le volt n'avait aucune raison d'exister.
  'weekly-goal': () => ({
    title: 'Objectif de la semaine atteint !',
    message: 'Cette séance est celle qui fait basculer ta semaine. Le reste est du bonus.',
  }),
};

export function CelebrationBanner({ reason, sportLabel, testID = 'celebration-banner' }: Props) {
  const copy = COPY[reason](sportLabel);
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
