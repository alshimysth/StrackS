/**
 * Derivations of the statistics screen (#24): the logic that doesn't need rendering to be
 * wrong: what goes to the server, and what we dare infer from a comparison.
 */
import {
  buildStatsPath,
  canGoForward,
  chartTitle,
  deltaPercent,
  formatDelta,
  periodTitle,
  shiftAnchor,
} from '../use-stats';

describe('buildStatsPath', () => {
  it('sends the period and the device time zone', () => {
    const path = buildStatsPath('summary', { period: 'month' });
    expect(path).toContain('/api/v1/stats/summary?');
    expect(path).toContain('period=month');
    expect(path).toContain('tz=');
  });

  it('only sends a sport filter when there is one', () => {
    expect(buildStatsPath('timeline', { period: 'week' })).not.toContain('sport=');
    expect(buildStatsPath('timeline', { period: 'week', sport: 'running' })).toContain(
      'sport=running',
    );
  });

  it('sends the anchor in ISO 8601', () => {
    const anchor = new Date('2026-07-15T10:00:00.000Z');
    expect(buildStatsPath('summary', { period: 'month', anchor })).toContain(
      `from=${encodeURIComponent('2026-07-15T10:00:00.000Z')}`,
    );
  });
});

describe('deltaPercent', () => {
  it('computes the relative change', () => {
    expect(deltaPercent(112, 100)).toBeCloseTo(12);
    expect(deltaPercent(80, 100)).toBeCloseTo(-20);
  });

  /**
   * Starting from zero isn't "+100 %": the rate is undefined. Showing a percentage here
   * would mean inventing a number, which the PRD forbids.
   */
  it('refuses to compare with an empty period', () => {
    expect(deltaPercent(42, 0)).toBeNull();
    expect(deltaPercent(0, 0)).toBeNull();
  });
});

describe('formatDelta', () => {
  it('signs the change and marks equality', () => {
    expect(formatDelta(12.4)).toBe('+ 12 %');
    expect(formatDelta(-3.6)).toBe('− 4 %');
    expect(formatDelta(0.2)).toBe('=');
  });

  it('returns nothing when the comparison is meaningless', () => {
    expect(formatDelta(null)).toBeNull();
  });

  /** Typographic minus sign (U+2212), not a hyphen: it lines up with the plus. */
  it('uses a real minus sign', () => {
    expect(formatDelta(-10)).toContain('−');
    expect(formatDelta(-10)).not.toContain('-');
  });
});

describe('shiftAnchor', () => {
  /**
   * The trap millisecond arithmetic falls into: from March 31st, "minus 30 days" lands on
   * March 1st, the same month as the start.
   */
  it('goes back one calendar month from the end of a month', () => {
    const march31 = new Date(2026, 2, 31, 12);
    expect(shiftAnchor('month', march31, -1).getMonth()).toBe(1); // February
  });

  it('goes back one week and one year', () => {
    const day = new Date(2026, 6, 15, 12);
    expect(shiftAnchor('week', day, -1).getDate()).toBe(8);
    expect(shiftAnchor('year', day, -1).getFullYear()).toBe(2025);
  });

  /** Same trap on February 29th: `setFullYear` on a leap day overflows into March. */
  it('goes back one year from February 29th without overflowing', () => {
    const leapDay = new Date(2028, 1, 29, 12);
    const previous = shiftAnchor('year', leapDay, -1);
    expect(previous.getFullYear()).toBe(2027);
    expect(previous.getMonth()).toBe(0);
  });

  it('does not alter the original date', () => {
    const anchor = new Date(2026, 6, 15, 12);
    shiftAnchor('month', anchor, -3);
    expect(anchor.getMonth()).toBe(6);
  });
});

describe('canGoForward', () => {
  /** Offering "August" from July while we're in July leads to an empty screen. */
  it('forbids moving past the current period', () => {
    const now = new Date(2026, 6, 15, 12);
    expect(canGoForward('month', new Date(2026, 6, 1, 12), now)).toBe(false);
    expect(canGoForward('month', new Date(2026, 5, 1, 12), now)).toBe(true);
  });
});

describe('periodTitle', () => {
  it('names the window according to the granularity', () => {
    const july15 = new Date(2026, 6, 15, 12);
    expect(periodTitle('year', july15)).toBe('2026');
    expect(periodTitle('month', july15)).toBe('Juillet 2026');
    // July 15th, 2026 is a Wednesday: the week starts on Monday the 13th.
    expect(periodTitle('week', july15)).toBe('Semaine du 13 juillet');
  });

  /** Sunday: `getDay()` is 0, Monday is 6 days back, not 1 day ahead. */
  it('brings a Sunday back to the preceding Monday', () => {
    expect(periodTitle('week', new Date(2026, 6, 19, 12))).toBe('Semaine du 13 juillet');
  });
});

describe('chartTitle', () => {
  it('follows the granularity returned by the server', () => {
    expect(chartTitle('day')).toBe('Distance par jour');
    expect(chartTitle('week')).toBe('Distance par semaine');
    expect(chartTitle('month')).toBe('Distance par mois');
  });
});
