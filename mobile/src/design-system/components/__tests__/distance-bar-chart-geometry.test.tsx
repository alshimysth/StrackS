/**
 * Chart geometry (#24).
 *
 * Since rendering can't be eyeballed in CI, these invariants stand in for a visual check,
 * and they hold up better over time than a screenshot: a bar taller than the plot, a
 * stack whose segments overflow, or a small value squashed to zero are measurable
 * defects.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { DistanceBarChart } from '../DistanceBarChart';
import type { StatsTimeline, TimelineBucket } from '../../../types/api';
import { createTestQueryClient } from '../../../test-support/query-client';

const PLOT_HEIGHT = 158;
const SEGMENT_GAP = 2;
const MIN_VISIBLE_HEIGHT = 3;

const LABELS = { running: 'Course à pied', walking: 'Marche' };

function bucket(start: string, values: Record<string, number>): TimelineBucket {
  return {
    start,
    end: start,
    bySport: Object.entries(values).map(([sportType, distanceM]) => ({
      sportType,
      distanceM,
      sessions: 1,
      durationS: 1800,
    })),
  };
}

function timelineOf(buckets: TimelineBucket[]): StatsTimeline {
  return { from: buckets[0].start, to: buckets[0].start, bucket: 'week', buckets };
}

/** Effective height of an element, flattened styles. */
function heightOf(testID: string): number {
  const style = StyleSheet.flatten(screen.getByTestId(testID).props.style) as { height?: number };
  return style.height ?? 0;
}

const localMidnight = (d: number) => new Date(2026, 6, d).toISOString();

/**
 * The chart formats its distances through `useFormat`, hence reads preferences through
 * react-query (#30): it needs a client. No request actually goes out; the formatter falls
 * back to metric defaults while nothing has loaded.
 */
let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = createTestQueryClient({ enabled: false });
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('chart geometry', () => {
  it('gives the full plot height to the highest interval, and never more', async () => {
    await render(
      <DistanceBarChart
        timeline={timelineOf([
          bucket(localMidnight(6), { running: 10_000 }),
          bucket(localMidnight(13), { running: 40_000 }),
          bucket(localMidnight(20), { running: 20_000 }),
        ])}
        labels={LABELS}
      />,
      { wrapper: Wrapper },
    );

    expect(heightOf('chart-stack-1')).toBeCloseTo(PLOT_HEIGHT);
    expect(heightOf('chart-stack-0')).toBeCloseTo(PLOT_HEIGHT / 4);
    expect(heightOf('chart-stack-2')).toBeCloseTo(PLOT_HEIGHT / 2);
  });

  /**
   * Gaps are taken FROM the usable height, not added on top: otherwise a two-sport column
   * would exceed a one-sport column of the same value, and the chart would misstate the
   * order of the weeks.
   */
  it('does not make a stack overflow because of its gaps', async () => {
    await render(
      <DistanceBarChart
        timeline={timelineOf([
          bucket(localMidnight(6), { running: 30_000, walking: 10_000 }),
          bucket(localMidnight(13), { running: 40_000 }),
        ])}
        labels={LABELS}
      />,
      { wrapper: Wrapper },
    );

    // Two columns with the same total: same height, despite the inner gap.
    expect(heightOf('chart-stack-0')).toBeCloseTo(heightOf('chart-stack-1'));
    expect(heightOf('chart-stack-0')).toBeCloseTo(PLOT_HEIGHT);

    const segments =
      heightOf('chart-stack-0-running') + heightOf('chart-stack-0-walking') + SEGMENT_GAP;
    expect(segments).toBeCloseTo(PLOT_HEIGHT);
  });

  /**
   * A 300 m run in a 40 km month would be less than a pixel: an invisible bar would read
   * as "no session", which is wrong.
   */
  it('keeps a tiny value visible without confusing it with zero', async () => {
    await render(
      <DistanceBarChart
        timeline={timelineOf([
          bucket(localMidnight(6), { running: 40_000 }),
          bucket(localMidnight(13), { running: 300 }),
          bucket(localMidnight(20), {}),
        ])}
        labels={LABELS}
      />,
      { wrapper: Wrapper },
    );

    expect(heightOf('chart-stack-1')).toBeGreaterThanOrEqual(MIN_VISIBLE_HEIGHT);
    // ...and the really empty interval stays a hairline, not a bar.
    expect(screen.queryByTestId('chart-stack-2')).toBeNull();
    expect(screen.getByTestId('chart-stack-2-zero')).toBeOnTheScreen();
  });

  it('renders nothing misleading when the whole period is zero', async () => {
    await render(
      <DistanceBarChart
        timeline={timelineOf([bucket(localMidnight(6), {}), bucket(localMidnight(13), {})])}
        labels={LABELS}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByTestId('distance-chart')).toBeNull();
    expect(screen.getByText('Aucune distance enregistrée sur cette période.')).toBeOnTheScreen();
  });

  /** The legend is always there from two series on: identity never relies on colour alone. */
  it('quantifies each series in the legend', async () => {
    await render(
      <DistanceBarChart
        timeline={timelineOf([bucket(localMidnight(6), { running: 12_000, walking: 3_000 })])}
        labels={LABELS}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Course à pied · 12,00 km')).toBeOnTheScreen();
    expect(screen.getByText('Marche · 3,00 km')).toBeOnTheScreen();
  });
});
