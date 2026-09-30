/**
 * Distance per interval, stacked by sport (#24).
 *
 * The product's only chart. Dataviz rules applied, each for a reason visible on screen:
 *
 * - **A single axis.** Distance only. Adding duration would require a second scale, whose
 *   alignment with the first would be arbitrary: the chart would invent a correlation
 *   absent from the data.
 * - **Colour follows the sport, never its rank.** Filtering on running doesn't repaint
 *   the remaining bars; whoever learned "walking is green" isn't tricked.
 * - **Direct label on the single peak only.** A number on each bar becomes unreadable;
 *   the other values go through selection and the legend.
 * - **A 2 px gap in surface colour** between stacked segments, rather than a separator
 *   line: an outline would add ink that isn't data.
 * - **Text never takes the series colour**: identity comes from the dot placed next to
 *   it, not from the colour of the characters.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dataSeriesColors, radius, spacing, typography } from '../theme';
import { useTheme } from '../use-theme';
import { useFormat, type Formatter } from '../../core/format/use-format';
import type { StatsTimeline, TimelineBucket } from '../../types/api';

const PLOT_HEIGHT = 158;
const SEGMENT_GAP = 2;
/**
 * A 300 m run in a 40 km month would be less than a pixel. It's guaranteed three: an
 * invisible bar reads as "no session", which is wrong. The distortion stays under 2 % of
 * the plot height and changes no ordering.
 */
const MIN_VISIBLE_HEIGHT = 3;

interface Props {
  timeline: StatsTimeline;
  /** Sport labels, as the backend names them. */
  labels: Record<string, string>;
}

export function DistanceBarChart({ timeline, labels }: Props) {
  const format = useFormat();
  const theme = useTheme();
  const buckets = timeline.buckets;

  const totals = buckets.map(bucketDistance);
  const max = Math.max(...totals, 0);
  const peakIndex = max > 0 ? totals.indexOf(max) : -1;
  const [selected, setSelected] = React.useState<number | null>(null);
  const highlighted = selected ?? peakIndex;

  // Sport order is fixed across the whole chart: sorting by value within each column
  // would make colours jump from one interval to the next.
  const sports = seriesOrder(buckets);

  if (max <= 0) {
    return (
      <Text style={[typography.body, { color: theme.textSecondary }]}>
        Aucune distance enregistrée sur cette période.
      </Text>
    );
  }

  return (
    <View style={styles.chart} testID="distance-chart">
      <View style={styles.plot} accessibilityRole="image" accessibilityLabel={summaryLabel(timeline, labels, format)}>
        {buckets.map((bucket, index) => {
          const total = totals[index];
          const isHighlighted = index === highlighted;
          return (
            <Pressable
              key={bucket.start}
              testID={`chart-bucket-${index}`}
              onPress={() => setSelected(index === selected ? null : index)}
              accessibilityRole="button"
              accessibilityState={{ selected: isHighlighted }}
              accessibilityLabel={`${bucketLabel(bucket, timeline.bucket)} : ${format.distance(total)} ${format.distanceUnit}`}
              style={styles.column}
            >
              {/* Height reserved at all times: without it, showing the value would move
                  the whole column up and down on each selection. */}
              <Text
                numberOfLines={1}
                style={[
                  styles.valueLabel,
                  { color: isHighlighted ? theme.textPrimary : 'transparent' },
                ]}
              >
                {total > 0 ? format.distance(total) : ''}
              </Text>

              <View style={styles.stackArea}>
                <Stack
                  bucket={bucket}
                  sports={sports}
                  total={total}
                  max={max}
                  surface={theme.surfaceCard}
                  zeroRule={theme.borderSubtle}
                  testID={`chart-stack-${index}`}
                />
              </View>

              <Text
                numberOfLines={1}
                style={[
                  styles.axisLabel,
                  { color: isHighlighted ? theme.textPrimary : theme.textSecondary },
                ]}
              >
                {bucketLabel(bucket, timeline.bucket)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Legend from TWO series on: identity then never relies on colour alone, and it's
          quantified, which is also the per-sport total. A single series does without it:
          the chart title already says what's plotted, and a lone dot would only repeat
          it. */}
      {sports.length > 1 && (
      <View style={styles.legend}>
        {sports.map((sport) => (
          <View key={sport} style={styles.legendItem}>
            <View
              style={[styles.swatch, { backgroundColor: seriesColor(sport, theme.textSecondary) }]}
            />
            <Text style={[typography.caption, { color: theme.textSecondary }]}>
              {labels[sport] ?? sport} · {format.distance(seriesTotal(buckets, sport))} {format.distanceUnit}
            </Text>
          </View>
        ))}
      </View>
      )}
    </View>
  );
}

function Stack({
  bucket,
  sports,
  total,
  max,
  surface,
  zeroRule,
  testID,
}: {
  bucket: TimelineBucket;
  sports: string[];
  total: number;
  max: number;
  surface: string;
  zeroRule: string;
  testID: string;
}) {
  if (total <= 0) {
    // The interval exists and is zero: a hairline at the baseline says so, where a missing
    // column would read as "missing data".
    return <View testID={`${testID}-zero`} style={[styles.zeroRule, { backgroundColor: zeroRule }]} />;
  }

  const columnHeight = Math.max((total / max) * PLOT_HEIGHT, MIN_VISIBLE_HEIGHT);
  const present = sports
    .map((sport) => ({ sport, value: distanceOf(bucket, sport) }))
    .filter((entry) => entry.value > 0);

  // Gaps are taken from the usable height, not added on top: otherwise a three-sport
  // column would exceed a one-sport column of the same value.
  const gaps = SEGMENT_GAP * Math.max(present.length - 1, 0);
  const usable = Math.max(columnHeight - gaps, MIN_VISIBLE_HEIGHT);

  return (
    <View testID={testID} style={[styles.stack, { height: columnHeight }]}>
      {present.map((entry, index) => (
        <View
          key={entry.sport}
          testID={`${testID}-${entry.sport}`}
          style={[
            {
              height: Math.max((entry.value / total) * usable, MIN_VISIBLE_HEIGHT),
              backgroundColor: seriesColor(entry.sport, surface),
            },
            // Rounded corner at the top of the stack only: the bottom is anchored to the
            // baseline and must stay square.
            index === 0 && styles.stackTop,
            index > 0 && { marginTop: SEGMENT_GAP },
          ]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

export function bucketDistance(bucket: TimelineBucket): number {
  return bucket.bySport.reduce((sum, value) => sum + value.distanceM, 0);
}

function distanceOf(bucket: TimelineBucket, sport: string): number {
  return bucket.bySport.find((value) => value.sportType === sport)?.distanceM ?? 0;
}

export function seriesTotal(buckets: TimelineBucket[], sport: string): number {
  return buckets.reduce((sum, bucket) => sum + distanceOf(bucket, sport), 0);
}

/**
 * Stacking order, stable across the whole chart: first seen, first placed. Sorting by
 * value would change the segment order from one column to the next.
 */
export function seriesOrder(buckets: TimelineBucket[]): string[] {
  const seen: string[] = [];
  for (const bucket of buckets) {
    for (const value of bucket.bySport) {
      if (value.distanceM > 0 && !seen.includes(value.sportType)) {
        seen.push(value.sportType);
      }
    }
  }
  return seen;
}

/** A sport unknown to the design system falls back to a neutral colour rather than nothing. */
function seriesColor(sport: string, fallback: string): string {
  return dataSeriesColors[sport] ?? fallback;
}

export function bucketLabel(bucket: TimelineBucket, unit: StatsTimeline['bucket']): string {
  const date = new Date(bucket.start);
  if (unit === 'day') {
    return date.toLocaleDateString('fr-FR', { weekday: 'narrow' });
  }
  if (unit === 'month') {
    return date.toLocaleDateString('fr-FR', { month: 'narrow' });
  }
  // Week: the day of its Monday, the only label that fits under a bar.
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

/**
 * Accessibility label of the chart. A pure helper: the formatter is passed to it, it
 * calls no hook, since the function is also used outside rendering.
 */
function summaryLabel(
  timeline: StatsTimeline,
  labels: Record<string, string>,
  format: Formatter,
): string {
  const sports = seriesOrder(timeline.buckets)
    .map(
      (sport) =>
        `${labels[sport] ?? sport} ${format.distance(seriesTotal(timeline.buckets, sport))} ${format.distanceUnit}`,
    )
    .join(', ');
  return `Distance par intervalle. ${sports || 'aucune donnée'}.`;
}

const styles = StyleSheet.create({
  chart: { gap: spacing.md },
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  column: { flex: 1, alignItems: 'center', gap: 6 },
  stackArea: { height: PLOT_HEIGHT, width: '100%', justifyContent: 'flex-end' },
  stack: { width: '100%', justifyContent: 'flex-end' },
  stackTop: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  zeroRule: { height: 2, width: '100%', borderRadius: 1 },
  valueLabel: { ...typography.caption, fontVariant: ['tabular-nums'], height: 14 },
  axisLabel: { ...typography.caption, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.base },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 11, height: 11, borderRadius: 3 },
});
