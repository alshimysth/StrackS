/**
 * Summary screen: no celebration from a cache from before the session (#69).
 *
 * Both reasons to celebrate are read from shared caches: the week's totals key is the
 * home screen goal card's, and the "first session" probe may have been filled by a
 * previous summary. These tests prefill those caches with data **older than the
 * session**, as the home screen would have left them, and check that no volt banner
 * appears, not even for a single render.
 *
 * The banner is replaced by a probe logging each of its renders: an assertion on the
 * final state wouldn't see a banner shown then removed.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import SummaryScreen from '../summary/[id]';
import { deviceTimeZone } from '../../core/api/use-stats';
import { QUERY_KEY as PREFERENCES_KEY } from '../../core/preferences/use-preferences';
import { DEFAULT_PREFERENCES } from '../../core/preferences/schema';
import { createTestQueryClient } from '../../test-support/query-client';
import type { Activity, Page, StatsSummary } from '../../types/api';

const mockApi = jest.fn();
const mockBannerRenders: string[] = [];
let mockBannerRecords: string[] | undefined;

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'act-4' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../design-system/components/CelebrationBanner', () => ({
  CelebrationBanner: ({ reason, records }: { reason: string; records?: string[] }) => {
    mockBannerRenders.push(reason);
    mockBannerRecords = records;
    return null;
  },
}));

/** The summary body (map, splits, sport panel) isn't the subject here. */
jest.mock('../../core/activity/ActivityDetailBody', () => ({
  ActivityDetailBody: () => null,
}));

const NOW = Date.now();
/** The session just ended: that's the instant that decides between caches. */
const ENDED_AT_MS = NOW - 1_000;
const WEEK_FROM = new Date(NOW - 3 * 24 * 3600 * 1000).toISOString();
const WEEK_TO = new Date(NOW + 3 * 24 * 3600 * 1000).toISOString();

const ACTIVITY: Activity = {
  id: 'act-4',
  sportType: 'running',
  status: 'completed',
  startedAt: new Date(ENDED_AT_MS - 20 * 60 * 1000).toISOString(),
  endedAt: new Date(ENDED_AT_MS).toISOString(),
  durationS: 1200,
  distanceM: 4000,
  calories: null,
  title: null,
  notes: null,
  metrics: {},
};

const STATS_KEY = ['stats', 'summary', 'week', 'all', 'now', deviceTimeZone()];
const PROBE_KEY = ['activities', 'running', 'first-session-probe'];

function weekStats(sessions: number): StatsSummary {
  return {
    from: WEEK_FROM,
    to: WEEK_TO,
    bySport: [],
    totalSessions: sessions,
    totalDurationS: sessions * 1200,
    totals: { distanceM: sessions * 4000 },
    previous: { sessions: 0, durationS: 0, totals: {} },
  };
}

function page(total: number): Page<Activity> {
  return { items: [ACTIVITY], page: 0, size: 1, total };
}

/**
 * The aggregates answer after the activity detail, as in production (an aggregation
 * versus a keyed read). With instant responses, the refetch would land before the first
 * useful render and hide the defect.
 */
const later = <T,>(value: T) =>
  new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), 30);
  });

interface RecordHolders {
  /** Holder of the distance record; an older session by default. */
  distance?: string;
  duration?: string;
  fail?: boolean;
}

function records(sportSessions: number, holders: RecordHolders) {
  return {
    bySport: [
      {
        sportType: 'running',
        label: 'Course à pied',
        sessions: sportSessions,
        records: [
          { key: 'durationS', label: 'Plus longue séance', unit: 's', value: 1800,
            activityId: holders.duration ?? 'act-old', startedAt: '2025-01-01T08:00:00Z' },
          { key: 'distanceM', label: 'Plus longue distance', unit: 'm', value: 9000,
            activityId: holders.distance ?? 'act-old', startedAt: '2025-01-01T08:00:00Z' },
        ],
      },
    ],
  };
}

/** Server responses **after** the session. */
function serverAfterSession(opts: {
  weekSessions: number;
  sportSessions: number;
  records?: RecordHolders;
}) {
  mockApi.mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/stats/records')) {
      return opts.records?.fail === true
        ? Promise.reject(new Error('hors ligne'))
        : later(records(opts.sportSessions, opts.records ?? {}));
    }
    if (path.startsWith('/api/v1/stats/summary')) {
      return later(weekStats(opts.weekSessions));
    }
    if (path.startsWith('/api/v1/activities?')) {
      return later(page(opts.sportSessions));
    }
    if (path === '/api/v1/users/me/preferences') {
      return Promise.resolve({}); // defaults: no goal
    }
    if (path === '/api/v1/activities/act-4') {
      return Promise.resolve(ACTIVITY);
    }
    return Promise.reject(new Error(`appel inattendu : ${path}`));
  });
}

function withSessionGoal(sessions: number) {
  client.setQueryData(PREFERENCES_KEY, {
    ...DEFAULT_PREFERENCES,
    weeklyGoal: { distanceM: null, sessions },
  });
}

/** What `stop()` does after a successful close (see use-session-store). */
async function invalidateLikeStop() {
  await client.invalidateQueries({ queryKey: ['stats'] });
  await client.invalidateQueries({ queryKey: ['activities'] });
}

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const statsCalls = () =>
  mockApi.mock.calls.filter(([path]) => String(path).startsWith('/api/v1/stats/summary'));
const probeCalls = () =>
  mockApi.mock.calls.filter(([path]) => String(path).startsWith('/api/v1/activities?'));

beforeEach(() => {
  // Same staleTime as the app: it's what made a short session dangerous.
  client = createTestQueryClient({ staleTime: 30_000 });
  mockBannerRenders.length = 0;
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('Summary: weekly goal from a cache from before the session (#69)', () => {
  it('does not celebrate, even briefly, a goal already reached before the session', async () => {
    // 3-session goal, already reached; the home screen cached "3" just before.
    withSessionGoal(3);
    client.setQueryData(STATS_KEY, weekStats(3), { updatedAt: ENDED_AT_MS - 60_000 });
    client.setQueryData(PROBE_KEY, page(3), { updatedAt: ENDED_AT_MS - 60_000 });
    await invalidateLikeStop();
    serverAfterSession({ weekSessions: 4, sportSessions: 4 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(statsCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mockBannerRenders).toEqual([]);
  });

  /**
   * Session shorter than 30 s: the cached data is still "fresh" for react-query, nothing
   * refreshes it. Only the comparison with `endedAt` protects. The invalidation is
   * deliberately not replayed: the guard must hold alone.
   */
  it('concludes nothing from a fresh cache older than the end of the session', async () => {
    withSessionGoal(3);
    client.setQueryData(STATS_KEY, weekStats(3), { updatedAt: ENDED_AT_MS - 20_000 });
    client.setQueryData(PROBE_KEY, page(3), { updatedAt: ENDED_AT_MS - 20_000 });
    serverAfterSession({ weekSessions: 4, sportSessions: 4 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(statsCalls()).toHaveLength(0); // the scenario is indeed the cache deemed fresh
    expect(mockBannerRenders).toEqual([]);
  });

  it('celebrates the session crossing the goal, once the totals are up to date', async () => {
    withSessionGoal(3);
    client.setQueryData(STATS_KEY, weekStats(2), { updatedAt: ENDED_AT_MS - 60_000 });
    await invalidateLikeStop();
    serverAfterSession({ weekSessions: 3, sportSessions: 3 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(mockBannerRenders).toContain('weekly-goal'));
    // Nothing before the totals from after the session have arrived.
    expect(new Set(mockBannerRenders)).toEqual(new Set(['weekly-goal']));
  });
});

describe('Summary: cached "first session" probe (#69)', () => {
  it('does not celebrate a first session from a probe filled by a previous summary', async () => {
    // The real first session's summary had cached `total: 1`.
    client.setQueryData(PROBE_KEY, page(1), { updatedAt: ENDED_AT_MS - 3_600_000 });
    await invalidateLikeStop();
    serverAfterSession({ weekSessions: 2, sportSessions: 2 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(probeCalls()).toHaveLength(1));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mockBannerRenders).toEqual([]);
  });

  it('celebrates the real first session', async () => {
    serverAfterSession({ weekSessions: 1, sportSessions: 1 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(mockBannerRenders).toContain('first-session'));
    expect(new Set(mockBannerRenders)).toEqual(new Set(['first-session']));
  });
});

describe('Summary: personal record (#61)', () => {
  it('celebrates the record broken by this session, with the server label', async () => {
    serverAfterSession({ weekSessions: 2, sportSessions: 12, records: { distance: 'act-4' } });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(mockBannerRenders).toContain('personal-record'));
    expect(new Set(mockBannerRenders)).toEqual(new Set(['personal-record']));
    expect(mockBannerRecords).toEqual(['Plus longue distance']);
  });

  /** Record and goal on the same session: a single banner, the rarest. */
  it('prefers the record to the weekly goal crossed by the same session', async () => {
    withSessionGoal(3);
    client.setQueryData(STATS_KEY, weekStats(2), { updatedAt: ENDED_AT_MS - 60_000 });
    await invalidateLikeStop();
    serverAfterSession({ weekSessions: 3, sportSessions: 12, records: { distance: 'act-4' } });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(mockBannerRenders).toContain('personal-record'));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mockBannerRenders).not.toContain('weekly-goal');
  });

  it('celebrates nothing when the record belongs to another session', async () => {
    serverAfterSession({ weekSessions: 2, sportSessions: 12 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mockBannerRenders).toEqual([]);
  });

  /** Without a records response, the other reasons to celebrate stay valid. */
  it('lets the weekly goal through when the records are unreachable', async () => {
    withSessionGoal(3);
    client.setQueryData(STATS_KEY, weekStats(2), { updatedAt: ENDED_AT_MS - 60_000 });
    await invalidateLikeStop();
    serverAfterSession({ weekSessions: 3, sportSessions: 12, records: { fail: true } });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(mockBannerRenders).toContain('weekly-goal'));
    expect(mockBannerRenders).not.toContain('personal-record');
  });
});

