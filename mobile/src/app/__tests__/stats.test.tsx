/**
 * Statistics screen: the behaviours #24's DoD makes mandatory.
 *
 * Two requirements are checked literally:
 *  - "the displayed figures match the /stats/summary response exactly";
 *  - "the screen stays correct when a sport has no session in the period".
 */
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import StatsScreen from '../(tabs)/stats';
import { ApiError } from '../../core/api/client';
import type { SportTypeDescriptor, StatsSummary, StatsTimeline } from '../../types/api';
import { createTestQueryClient } from '../../test-support/query-client';

const mockApi = jest.fn();

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

/** Local midnight: what the server returns, having received the client's time zone. */
const localMidnight = (year: number, month: number, day: number) =>
  new Date(year, month, day).toISOString();

function summary(overrides: Partial<StatsSummary> = {}): StatsSummary {
  return {
    from: localMidnight(2026, 6, 1),
    to: localMidnight(2026, 7, 1),
    bySport: [
      {
        sportType: 'running',
        label: 'Course à pied',
        sessions: 18,
        totalDurationS: 41_400,
        totals: { distanceM: 107_500, elevationGainM: 980 },
      },
      {
        sportType: 'walking',
        label: 'Marche',
        sessions: 8,
        totalDurationS: 8_040,
        totals: { distanceM: 30_300, elevationGainM: 304 },
      },
    ],
    totalSessions: 26,
    totalDurationS: 49_440,
    totals: { distanceM: 137_800, elevationGainM: 1284 },
    previous: { sessions: 23, durationS: 41_200, totals: { distanceM: 123_000 } },
    ...overrides,
  };
}

function timeline(overrides: Partial<StatsTimeline> = {}): StatsTimeline {
  return {
    from: localMidnight(2026, 6, 1),
    to: localMidnight(2026, 7, 1),
    bucket: 'week',
    buckets: [
      {
        start: localMidnight(2026, 5, 29),
        end: localMidnight(2026, 6, 6),
        bySport: [
          { sportType: 'running', sessions: 3, durationS: 7200, distanceM: 18_000 },
          { sportType: 'walking', sessions: 1, durationS: 1800, distanceM: 6_300 },
        ],
      },
      // Week without sessions: it exists and is zero.
      { start: localMidnight(2026, 6, 6), end: localMidnight(2026, 6, 13), bySport: [] },
      {
        start: localMidnight(2026, 6, 13),
        end: localMidnight(2026, 6, 20),
        bySport: [{ sportType: 'running', sessions: 5, durationS: 12_000, distanceM: 31_600 }],
      },
    ],
    ...overrides,
  };
}

const SPORTS: SportTypeDescriptor[] = [
  { code: 'running', label: 'Course à pied', usesGps: true, schemaVersion: 1 },
  { code: 'walking', label: 'Marche', usesGps: true, schemaVersion: 1 },
];

/** Routes by URL: the screen makes three calls (sports, summary and bucketing). */
function respond(handler: (path: string) => unknown) {
  mockApi.mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/sport-types')) return Promise.resolve(SPORTS);
    const result = handler(path);
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
}

function respondOk(s: StatsSummary = summary(), t: StatsTimeline = timeline()) {
  respond((path) => (path.includes('/timeline') ? t : s));
}

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderScreen = () => render(<StatsScreen />, { wrapper: Wrapper });

beforeEach(() => {
  client = createTestQueryClient();
  onlineManager.setOnline(true);
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('Statistics: DoD #24', () => {
  /**
   * The heart of the DoD: no figure is recomputed on the client. The displayed distance
   * is `totals.distanceM`, not the sum of the chart bars.
   */
  it('shows exactly the figures of /stats/summary', async () => {
    respondOk();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('stats-screen')).toBeOnTheScreen());
    expect(screen.getByText('137,80')).toBeOnTheScreen(); // 137 800 m
    expect(screen.getByText('26')).toBeOnTheScreen(); // sessions
    expect(screen.getByText('13:44:00')).toBeOnTheScreen(); // 49 440 s
    expect(screen.getByText('1284')).toBeOnTheScreen(); // D+
  });

  it('compares with the previous period without recomputing the trend elsewhere', async () => {
    respondOk();
    await renderScreen();

    // Each card carries ITS own comparison, not a copied global trend:
    // distance 137,800 vs 123,000 → + 12 %; duration 49,440 s vs 41,200 → + 20 %;
    // sessions 26 vs 23 → + 3, as a raw difference since a percentage says less there.
    await waitFor(() => expect(screen.getByText('+ 12 %')).toBeOnTheScreen());
    expect(screen.getByText('+ 20 %')).toBeOnTheScreen();
    expect(screen.getByText('+ 3')).toBeOnTheScreen();
  });

  /**
   * An empty previous period doesn't give "+100 %": the rate is undefined, and the PRD
   * forbids showing a made-up number.
   */
  it('shows no trend when the previous period is empty', async () => {
    respondOk(summary({ previous: { sessions: 0, durationS: 0, totals: {} } }));
    await renderScreen();

    await waitFor(() => expect(screen.getByText('137,80')).toBeOnTheScreen());
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(screen.queryByText(/^\+ \d+$/)).toBeNull();
  });

  // ------------------------------------------------------------------
  // "The screen stays correct when a sport has no session in the period"
  // ------------------------------------------------------------------

  it('shows an explicit empty state when the period has no session', async () => {
    respondOk(
      summary({ bySport: [], totalSessions: 0, totalDurationS: 0, totals: {} }),
      timeline({ buckets: [] }),
    );
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('empty-state-filtered')).toBeOnTheScreen());
    expect(screen.getByText('Aucune séance sur cette période')).toBeOnTheScreen();
  });

  /**
   * The backend core only names sessions and duration; distance and elevation are
   * declared by the plugins. A sport without distance therefore brings up neither an
   * empty "Distance" card nor a "0 km" that would be wrong (#46).
   */
  it('only shows the metrics actually declared by the sports', async () => {
    respondOk(
      summary({
        bySport: [
          {
            sportType: 'strength',
            label: 'Musculation',
            sessions: 4,
            totalDurationS: 7200,
            totals: {},
          },
        ],
        totalSessions: 4,
        totalDurationS: 7200,
        totals: {},
        previous: { sessions: 2, durationS: 3600, totals: {} },
      }),
      timeline({ buckets: [] }),
    );
    await renderScreen();

    await waitFor(() => expect(screen.getByText('Musculation')).toBeOnTheScreen());
    expect(screen.getByText('Séances')).toBeOnTheScreen();
    expect(screen.getByText('Temps actif')).toBeOnTheScreen();
    expect(screen.queryByText('Distance')).toBeNull();
    expect(screen.queryByText('Dénivelé +')).toBeNull();
  });

  it('marks a sport without distance with a dash in the per-sport detail', async () => {
    respondOk(
      summary({
        bySport: [
          {
            sportType: 'strength',
            label: 'Musculation',
            sessions: 4,
            totalDurationS: 7200,
            totals: {},
          },
        ],
        totalSessions: 4,
        totalDurationS: 7200,
        totals: {},
      }),
      timeline({ buckets: [] }),
    );
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('sport-row-strength')).toBeOnTheScreen());
    expect(screen.getByText('—')).toBeOnTheScreen();
  });

  // ------------------------------------------------------------------
  // Server aggregation
  // ------------------------------------------------------------------

  /**
   * Decision of 2026-08-10: the weekly bucketing is computed by the server. The screen
   * must never pull the history to aggregate it itself, which would defeat pagination and
   * blow #28's budget.
   */
  it('never calls /activities', async () => {
    respondOk();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('distance-chart')).toBeOnTheScreen());
    const paths = mockApi.mock.calls.map(([path]) => path as string);
    expect(paths.some((p) => p.includes('/api/v1/stats/summary'))).toBe(true);
    expect(paths.some((p) => p.includes('/api/v1/stats/timeline'))).toBe(true);
    expect(paths.some((p) => p.includes('/api/v1/activities'))).toBe(false);
  });

  it('sends the chosen period to the server rather than filtering locally', async () => {
    respondOk();
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('stats-screen')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('chip-year'));

    await waitFor(() => {
      const paths = mockApi.mock.calls.map(([path]) => path as string);
      expect(paths.some((p) => p.includes('period=year'))).toBe(true);
    });
  });

  it('sends the device time zone, so the weeks match the user calendar', async () => {
    respondOk();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('stats-screen')).toBeOnTheScreen());
    const statsCalls = mockApi.mock.calls
      .map(([path]) => path as string)
      .filter((p) => p.includes('/api/v1/stats/'));
    expect(statsCalls.length).toBeGreaterThan(0);
    expect(statsCalls.every((p) => p.includes('tz='))).toBe(true);
  });

  /**
   * The sport filter goes to the server like the period. Applying it locally would
   * require having pulled the sessions, exactly what this screen avoids.
   */
  it('sends the sport filter to the server', async () => {
    respondOk();
    await renderScreen();
    // The sport chips come from the registry: they only exist once /sport-types has
    // resolved, after the screen's first render.
    await waitFor(() => expect(screen.getByTestId('chip-walking')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('chip-walking'));

    await waitFor(() => {
      const paths = mockApi.mock.calls.map(([path]) => path as string);
      expect(paths.some((p) => p.includes('/stats/summary') && p.includes('sport=walking')))
        .toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Period navigation
  // ------------------------------------------------------------------

  it('goes back one period and asks the server again', async () => {
    respondOk();
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('stats-screen')).toBeOnTheScreen());

    const before = mockApi.mock.calls.length;
    await fireEvent.press(screen.getByTestId('period-prev'));

    await waitFor(() => {
      const paths = mockApi.mock.calls.slice(before).map(([path]) => path as string);
      expect(paths.some((p) => p.includes('from='))).toBe(true);
    });
  });

  /** Moving past the current period would lead to an unexplained empty screen. */
  it('disables moving forward until the next period has started', async () => {
    respondOk();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('stats-screen')).toBeOnTheScreen());
    expect(screen.getByTestId('period-next')).toBeDisabled();
  });

  // ------------------------------------------------------------------
  // System states (#41)
  // ------------------------------------------------------------------

  it('shows the server error when there is nothing to show', async () => {
    respond(() => new ApiError({ title: 'Panne', status: 503, detail: 'indisponible' }));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-state-server')).toBeOnTheScreen());
  });

  it('talks about connection, not failure, when the request does not go through', async () => {
    respond(() => new TypeError('Network request failed'));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-state-offline')).toBeOnTheScreen());
  });

  /**
   * The chart is secondary: if it fails alone, the totals stay readable. Replacing the
   * whole screen with an error would deprive the user of perfectly valid figures.
   */
  it('keeps the totals when only the bucketing fails', async () => {
    respond((path) =>
      path.includes('/timeline')
        ? new ApiError({ title: 'Panne', status: 503, detail: 'indisponible' })
        : summary(),
    );
    await renderScreen();

    await waitFor(() => expect(screen.getByText('137,80')).toBeOnTheScreen());
    expect(screen.queryByTestId('error-state-server')).toBeNull();
  });
});
