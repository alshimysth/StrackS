/**
 * Story #23: the pagination and filtering logic, isolated from rendering.
 *
 * The DoD requires that "filters do call the backend (no client-side filtering)": what's
 * checked here is the URL actually built.
 */
import {
  buildActivitiesPath,
  groupByMonth,
  nextPageParam,
  periodStart,
} from '../use-activities';
import type { Activity, Page } from '../../../types/api';

function activity(id: string, startedAt: string): Activity {
  return {
    id,
    sportType: 'running',
    status: 'completed',
    startedAt,
    endedAt: startedAt,
    durationS: 600,
    distanceM: 2000,
    calories: null,
    title: null,
    notes: null,
    metrics: {},
  };
}

function page(items: Activity[], p: number, size: number, total: number): Page<Activity> {
  return { items, page: p, size, total };
}

describe('periodStart', () => {
  const now = new Date('2026-08-14T10:00:00.000Z');

  it('does not bound the "all" period', () => {
    expect(periodStart('all', now)).toBeUndefined();
  });

  it.each([
    ['week', '2026-08-07T10:00:00.000Z'],
    ['month', '2026-07-14T10:00:00.000Z'],
    ['year', '2025-08-14T10:00:00.000Z'],
  ] as const)('moves the lower bound back for "%s"', (period, expected) => {
    expect(periodStart(period, now)).toBe(expected);
  });

  it('does not mutate the date it is given', () => {
    const reference = new Date('2026-08-14T10:00:00.000Z');
    periodStart('year', reference);
    expect(reference.toISOString()).toBe('2026-08-14T10:00:00.000Z');
  });
});

describe('buildActivitiesPath', () => {
  it('requests pagination without filter when none is active', () => {
    expect(buildActivitiesPath({}, 0)).toBe('/api/v1/activities?page=0&size=20');
  });

  it('sends the sport to the server rather than filtering afterwards', () => {
    expect(buildActivitiesPath({ sport: 'walking' }, 2)).toContain('sport=walking');
    expect(buildActivitiesPath({ sport: 'walking' }, 2)).toContain('page=2');
  });

  it('sends the period bound to the server', () => {
    const path = buildActivitiesPath({ period: 'week' }, 0);
    expect(path).toMatch(/from=\d{4}-\d{2}-\d{2}T/);
  });

  it('sends no bound for the "all" period', () => {
    expect(buildActivitiesPath({ period: 'all' }, 0)).not.toContain('from=');
  });
});

describe('nextPageParam', () => {
  it('keeps going until the total is reached', () => {
    expect(nextPageParam(page([activity('a', '2026-08-01T10:00:00Z')], 0, 20, 45))).toBe(1);
  });

  it('stops when everything is loaded', () => {
    const items = Array.from({ length: 5 }, (_, i) => activity(`a${i}`, '2026-08-01T10:00:00Z'));
    expect(nextPageParam(page(items, 2, 20, 45))).toBeUndefined();
  });

  /**
   * The trap this test locks: an EXACTLY full last batch. Relying on
   * `items.length === size` would announce a nonexistent next page, and the list footer
   * would spin forever.
   */
  it('stops on an exactly full last batch', () => {
    const items = Array.from({ length: 20 }, (_, i) => activity(`a${i}`, '2026-08-01T10:00:00Z'));
    expect(nextPageParam(page(items, 1, 20, 40))).toBeUndefined();
  });
});

describe('groupByMonth', () => {
  it('groups activities of the same month under a single section', () => {
    const sections = groupByMonth([
      activity('a', '2026-08-12T10:00:00Z'),
      activity('b', '2026-08-03T10:00:00Z'),
      activity('c', '2026-07-28T10:00:00Z'),
    ]);
    expect(sections.map((s) => s.key)).toEqual(['2026-08', '2026-07']);
    expect(sections[0].data).toHaveLength(2);
    expect(sections[1].data).toHaveLength(1);
  });

  it('separates two months of the same rank in different years', () => {
    const sections = groupByMonth([
      activity('a', '2026-01-05T10:00:00Z'),
      activity('b', '2025-01-05T10:00:00Z'),
    ]);
    expect(sections.map((s) => s.key)).toEqual(['2026-01', '2025-01']);
  });

  /**
   * Arrival order must be kept as is: sorting again would pull page 2 into the middle of
   * page 1 on each infinite load.
   */
  it('preserves the order received from the server', () => {
    const sections = groupByMonth([
      activity('recent', '2026-08-12T10:00:00Z'),
      activity('ancien', '2026-08-01T10:00:00Z'),
    ]);
    expect(sections[0].data.map((a) => a.id)).toEqual(['recent', 'ancien']);
  });

  it('returns an empty list without section', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
