/**
 * Derivations of the distance chart (#24).
 *
 * What's tested here isn't layout but dataviz rules: series order and interval labelling
 * are what make the chart honest or misleading.
 */
import {
  bucketDistance,
  bucketLabel,
  seriesOrder,
  seriesTotal,
} from '../DistanceBarChart';
import type { TimelineBucket } from '../../../types/api';

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

describe('bucketDistance', () => {
  it('sums every sport of the interval', () => {
    expect(bucketDistance(bucket('2026-07-06T00:00:00.000Z', { running: 12000, walking: 3000 })))
      .toBe(15000);
  });

  it('is zero on an interval without sessions', () => {
    expect(bucketDistance(bucket('2026-07-06T00:00:00.000Z', {}))).toBe(0);
  });
});

describe('seriesOrder', () => {
  /**
   * Non-negotiable rule: colour follows the sport, never its rank. If the order were
   * recomputed by value in each column, segments would change colour from one week to
   * the next and a reader who learned "walking is green" would be misled.
   */
  it('fixes the series order across the whole chart, in order of appearance', () => {
    const buckets = [
      bucket('2026-07-06T00:00:00.000Z', { running: 12000, walking: 3000 }),
      // A week where walking largely dominates: the order must not flip.
      bucket('2026-07-13T00:00:00.000Z', { walking: 40000, running: 1000 }),
    ];
    expect(seriesOrder(buckets)).toEqual(['running', 'walking']);
  });

  it('ignores sports present but at zero', () => {
    const buckets = [bucket('2026-07-06T00:00:00.000Z', { running: 5000, walking: 0 })];
    expect(seriesOrder(buckets)).toEqual(['running']);
  });

  it('does not repeat a sport seen several times', () => {
    const buckets = [
      bucket('2026-07-06T00:00:00.000Z', { running: 5000 }),
      bucket('2026-07-13T00:00:00.000Z', { running: 6000 }),
    ];
    expect(seriesOrder(buckets)).toEqual(['running']);
  });
});

describe('seriesTotal', () => {
  it('totals a sport over the whole period, the legend figure', () => {
    const buckets = [
      bucket('2026-07-06T00:00:00.000Z', { running: 12000, walking: 3000 }),
      bucket('2026-07-13T00:00:00.000Z', { running: 8000 }),
    ];
    expect(seriesTotal(buckets, 'running')).toBe(20000);
    expect(seriesTotal(buckets, 'walking')).toBe(3000);
    expect(seriesTotal(buckets, 'climbing')).toBe(0);
  });
});

describe('bucketLabel', () => {
  /**
   * The server returns an interval's bound as the instant of **local midnight**: it cuts
   * in the time zone the client sent. The fixture must therefore be built in local time:
   * a hard-coded "UTC midnight" would designate the evening before for any time zone west
   * of Greenwich, and the test would only pass in London.
   */
  const localMidnight = (year: number, month: number, day: number) =>
    new Date(year, month, day).toISOString();

  it('labels a week with the day of its Monday', () => {
    // 2026-06-29 is the Monday of the week straddling June and July, the one the mockup
    // labels "29/6" at the start of a July month.
    expect(bucketLabel(bucket(localMidnight(2026, 5, 29), {}), 'week')).toBe('29/6');
  });

  it('gives a short label to day and month', () => {
    expect(bucketLabel(bucket(localMidnight(2026, 6, 15), {}), 'day')).toHaveLength(1);
    expect(bucketLabel(bucket(localMidnight(2026, 6, 15), {}), 'month').length)
      .toBeLessThanOrEqual(4);
  });
});
