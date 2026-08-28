/**
 * SplitsList — allure kilomètre par kilomètre (#22).
 *
 * Les splits sont calculés par `RunningPlugin` côté serveur et vivent dans
 * `metrics.splits` : ce composant ne recalcule rien, il met en forme. Une barre
 * proportionnelle situe chaque km par rapport au plus lent de la séance — c'est ce
 * qui rend un fractionné lisible d'un coup d'œil, là où une colonne de chiffres
 * demande de comparer mentalement.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';
import { useTheme } from '../use-theme';
import { useFormat } from '../../core/format/use-format';

export interface Split {
  km: number;
  paceSecPerKm: number;
}

interface Props {
  splits: Split[];
  /** Le mode allure/vitesse est réglé PAR SPORT : il faut savoir lequel on affiche. */
  sportCode: string;
  testID?: string;
}

/** Un tableau de `unknown` venu du JSONB : on ne garde que les entrées exploitables. */
export function parseSplits(raw: unknown): Split[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry) => {
    const split = entry as Partial<Split> | null;
    return typeof split?.km === 'number' && typeof split?.paceSecPerKm === 'number'
      ? [{ km: split.km, paceSecPerKm: split.paceSecPerKm }]
      : [];
  });
}

/**
 * Longueur de barre relative. Le plancher à 15 % évite qu'un km nettement plus
 * rapide que les autres se réduise à un trait invisible.
 */
export function barRatio(paceSecPerKm: number, slowest: number): number {
  if (slowest <= 0) {
    return 1;
  }
  return Math.max(0.15, paceSecPerKm / slowest);
}

export function SplitsList({ splits, sportCode, testID = 'splits-list' }: Props) {
  const theme = useTheme();
  const format = useFormat();
  if (splits.length === 0) {
    return null;
  }

  const slowest = Math.max(...splits.map((s) => s.paceSecPerKm));
  const fastest = Math.min(...splits.map((s) => s.paceSecPerKm));

  return (
    <View testID={testID} style={styles.container}>
      {splits.map((split) => {
        const isFastest = split.paceSecPerKm === fastest && splits.length > 1;
        return (
          <View key={split.km} style={styles.row} testID={`split-${split.km}`}>
            <Text style={[typography.label, styles.km, { color: theme.textSecondary }]}>
              {split.km}
            </Text>
            <View style={[styles.track, { backgroundColor: theme.surfaceSunken }]}>
              <View
                style={[
                  styles.bar,
                  {
                    width: `${barRatio(split.paceSecPerKm, slowest) * 100}%`,
                    backgroundColor: colors.primary500,
                  },
                ]}
              />
            </View>
            {/* Le km le plus rapide se distingue par la couleur du texte, pas par une
                teinte volt : `volt700` en marque de données sur fond clair mesure
                1,61 : 1 de contraste, et `volt900` n'entrera dans theme.ts qu'avec
                l'écran de stats (#24) — le fichier interdit l'édition manuelle. */}
            <Text
              style={[
                typography.bodyLg,
                styles.pace,
                { color: isFastest ? theme.textSuccess : theme.textPrimary },
              ]}
            >
              {format.speed(1000 / split.paceSecPerKm, sportCode)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  km: { width: 24, textAlign: 'right' },
  track: { flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: 8, borderRadius: radius.pill },
  pace: { width: 64, textAlign: 'right' },
});
