/**
 * History screen: the behaviours lot E's DoDs make mandatory.
 *
 * This test targets the design decisions, not the layout: which state shows in which
 * situation, and what the server actually receives when filtering.
 */
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import HistoryScreen from '../(tabs)/history';
import { ApiError } from '../../core/api/client';
import type { Activity, Page, SportTypeDescriptor } from '../../types/api';
import { createTestQueryClient } from '../../test-support/query-client';

const mockApi = jest.fn();

// `ApiError` stays the real class: `classifyError` relies on `instanceof`, and a full
// mock of the module would turn every error into "offline".
jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

const SPORTS: SportTypeDescriptor[] = [
  { code: 'running', label: 'Course', usesGps: true, schemaVersion: 1 },
  { code: 'walking', label: 'Marche', usesGps: true, schemaVersion: 1 },
];

function activity(id: string, startedAt = '2026-08-12T08:00:00.000Z'): Activity {
  return {
    id,
    sportType: 'running',
    status: 'completed',
    startedAt,
    endedAt: startedAt,
    durationS: 1800,
    distanceM: 5000,
    calories: null,
    title: null,
    notes: null,
    metrics: {},
  };
}

function pageOf(items: Activity[], total = items.length): Page<Activity> {
  return { items, page: 0, size: 20, total };
}

/** Routes calls by URL: the screen makes two (sports then activities). */
function respond(handler: (path: string) => unknown) {
  mockApi.mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/sport-types')) return Promise.resolve(SPORTS);
    const result = handler(path);
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
}

/**
 * Client kept so it can be cleared after each test: react-query schedules notification
 * and garbage-collection timers which, left in flight, hold the jest worker at the end of
 * the suite and cause updates outside `act` on an unmounted screen.
 */
let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderScreen = () => render(<HistoryScreen />, { wrapper: Wrapper });

beforeEach(() => {
  client = createTestQueryClient();
  onlineManager.setOnline(true);
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('History: system states', () => {
  it('shows the initial empty state when the user has no session', async () => {
    respond(() => pageOf([]));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('empty-state-initial')).toBeOnTheScreen());
    expect(screen.getByText('Pas encore de séance')).toBeOnTheScreen();
  });

  /**
   * Initial empty ≠ empty after filtering: offering "start your first session" to someone
   * who already has dozens but whose filter matches nothing is wrong.
   */
  it('tells the empty-after-filtering state from the initial empty state', async () => {
    respond((path) => (path.includes('sport=walking') ? pageOf([]) : pageOf([activity('a')])));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('chip-walking'));

    await waitFor(() => expect(screen.getByTestId('empty-state-filtered')).toBeOnTheScreen());
    expect(screen.queryByTestId('empty-state-initial')).toBeNull();
  });

  it('makes the filters clearable from the filtered empty state', async () => {
    respond((path) => (path.includes('sport=walking') ? pageOf([]) : pageOf([activity('a')])));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('chip-walking'));
    await waitFor(() => expect(screen.getByTestId('empty-state-filtered')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('reset-filters'));
    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());
  });

  it('shows the server error when there is nothing to show', async () => {
    respond(() => new ApiError({ title: 'Panne', status: 503, detail: 'indisponible' }));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-state-server')).toBeOnTheScreen());
  });

  /** Without a server response, the message must talk about the network, not an app failure. */
  it('talks about connection, not failure, when the request does not go through', async () => {
    respond(() => new TypeError('Network request failed'));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-state-offline')).toBeOnTheScreen());
    expect(screen.getByText('Pas de connexion')).toBeOnTheScreen();
  });
});

/** #5: on a notched iPhone, the title no longer goes under the status bar. */
it('renders in a safe area protecting the top of the screen', async () => {
  respond(() => pageOf([activity('a')]));
  await renderScreen();
  const safe = await screen.findByTestId('safe-screen');
  // Native form of the edges: the top is protected, the bottom is left to the tab bar.
  expect(safe.props.edges).toMatchObject({ top: 'additive', bottom: 'off' });
  expect(screen.getByText('Historique')).toBeOnTheScreen();
});

describe('History: server filtering (DoD #23)', () => {
  it('asks the backend for the filter rather than sorting the received page', async () => {
    respond(() => pageOf([activity('a')]));
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('chip-walking'));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('sport=walking')),
    );
  });

  it('bounds the period on the server', async () => {
    respond(() => pageOf([activity('a')]));
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('chip-week'));

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('from=')));
  });
});

describe('History: offline (DoD #27)', () => {
  /**
   * The heart of lot E's rule: offline isn't an error. As long as data remains, it's
   * shown, dated, instead of emptying the screen.
   */
  it('keeps the data visible and dates it instead of showing an error', async () => {
    respond(() => pageOf([activity('a')]));
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());

    // `onlineManager` notifies outside the React cycle: without `act`, the re-render it
    // triggers ends up as a warning instead of being awaited by the test.
    await act(async () => {
      onlineManager.setOnline(false);
    });

    await waitFor(() => expect(screen.getByTestId('offline-banner')).toBeOnTheScreen());
    expect(screen.getByTestId('history-list')).toBeOnTheScreen();
    expect(screen.queryByTestId('error-state-offline')).toBeNull();
  });

  it('shows no banner while the network is there', async () => {
    respond(() => pageOf([activity('a')]));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });
});
