/**
 * SplitsList: pace kilometre by kilometre (#22).
 *
 * Splits are computed by `RunningPlugin` on the server and live in `metrics.splits`: this
 * component recomputes nothing, it formats. A proportional bar places each km relative to
 * the session's slowest: that's what makes an interval session readable at a glance,
 * where a column of numbers requires comparing mentally.
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
  /** Pace/speed mode is set PER SPORT: we need to know which one is displayed. */
  sportCode: string;
  testID?: string;
}

/** An array of `unknown` from the JSONB: only usable entries are kept. */
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
 * Relative bar length. The 15 % floor keeps a km much faster than the others from shrinking
 * to an invisible line.
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
            {/* The fastest km stands out by its text colour, not by a volt tint:
                `volt700` as a data mark on a light background measures 1.61:1
                contrast. */}
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
