/**
 * Profile Preferences section (#7): behaviour when a save fails.
 *
 * Raised in review: the error banner can only describe ONE mutation. If a PATCH fails and
 * a second one succeeds, `update.isError` only reflects the second, and the first choice
 * is lost without a word. The chosen safeguard is to disable the chips during the save,
 * so there can never be two PATCHes in flight.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import ProfileScreen from '../(tabs)/profile';
import { ApiError } from '../../core/api/client';
import { DEFAULT_PREFERENCES } from '../../core/preferences/schema';
import { QUERY_KEY } from '../../core/preferences/use-preferences';
import { createTestQueryClient } from '../../test-support/query-client';

const mockApi = jest.fn();

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

jest.mock('../../core/auth/use-auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({ user: { displayName: 'Testeur', email: 't@example.com' }, logout: jest.fn() }),
    { getState: () => ({ user: null }) },
  ),
}));

/**
 * The registry is stubbed: the screen only uses it to filter the sports that can be
 * started, but importing it pulls the whole session engine behind it, hence
 * `expo-sqlite`, missing under jest.
 */
jest.mock('../../sports/registry', () => ({
  sportRegistry: { running: { code: 'running' }, walking: { code: 'walking' } },
}));

jest.mock('../../core/api/use-auth', () => ({
  useProfile: () => ({ data: { displayName: 'Testeur', email: 't@example.com' } }),
  useDeleteAccount: () => ({ mutate: jest.fn() }),
}));

const SPORTS = [
  { code: 'running', label: 'Course', usesGps: true, schemaVersion: 1 },
  { code: 'walking', label: 'Marche', usesGps: true, schemaVersion: 1 },
];

/** Profile totals (#7): served by path, they aren't the subject of this suite. */
const ALL_TIME = {
  from: '1970-01-01T00:00:00Z',
  to: '2026-09-28T00:00:00Z',
  bySport: [],
  totalSessions: 0,
  totalDurationS: 0,
  totals: {},
  previous: { sessions: 0, durationS: 0, totals: {} },
};

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = createTestQueryClient();
  client.setQueryData(QUERY_KEY, DEFAULT_PREFERENCES);
  client.setQueryData(['sport-types'], SPORTS);
  mockApi.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith('/api/v1/stats/summary') ? ALL_TIME : SPORTS),
  );
});

afterEach(() => {
  client.unmount();
  client.clear();
});

const renderScreen = () => render(<ProfileScreen />, { wrapper: Wrapper });

describe('Preferences: save failure', () => {
  it('shows an actionable error when the PATCH fails', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('preferences-section')).toBeOnTheScreen());

    mockApi.mockRejectedValueOnce(new ApiError({ title: 'Panne', status: 503, detail: 'ko' }));
    await fireEvent.press(screen.getByTestId('chip-imperial'));

    await waitFor(() =>
      expect(screen.getByTestId('preferences-update-error')).toBeOnTheScreen(),
    );
  });

  /**
   * The heart of the safeguard: while a save is in flight, no second choice goes out.
   * Otherwise the second one's success would erase the first one's error.
   *
   * The mutation is held by a promise resolved by hand at the end of the test; a promise
   * never resolved would leave jest hanging.
   */
  it('disables the chips during the save', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('preferences-section')).toBeOnTheScreen());

    let release: (value: unknown) => void = () => {};
    mockApi.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await fireEvent.press(screen.getByTestId('chip-imperial'));

    await waitFor(() => expect(screen.getByTestId('chip-dark')).toBeDisabled());
    expect(screen.getByTestId('chip-metric')).toBeDisabled();

    release({ ...DEFAULT_PREFERENCES, units: 'imperial' });
    await waitFor(() => expect(screen.getByTestId('chip-dark')).not.toBeDisabled());
  });

  it('retries the same patch from the error banner', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('preferences-section')).toBeOnTheScreen());

    mockApi.mockRejectedValueOnce(new ApiError({ title: 'Panne', status: 503, detail: 'ko' }));
    await fireEvent.press(screen.getByTestId('chip-imperial'));
    await waitFor(() => expect(screen.getByTestId('preferences-update-error')).toBeOnTheScreen());

    mockApi.mockResolvedValueOnce({ ...DEFAULT_PREFERENCES, units: 'imperial' });
    await fireEvent.press(screen.getByText('Réessayer'));

    await waitFor(() =>
      expect(mockApi).toHaveBeenLastCalledWith(
        '/api/v1/users/me/preferences',
        expect.objectContaining({ method: 'PATCH', body: { units: 'imperial' } }),
      ),
    );
  });
});

describe('GPS mode (#36)', () => {
  it('saves the chosen mode and explains its effect', async () => {
    mockApi.mockImplementation((path: string, options?: { method?: string; body?: object }) =>
      Promise.resolve(
        options?.method === 'PATCH'
          ? { ...DEFAULT_PREFERENCES, ...options.body }
          : path.startsWith('/api/v1/stats/summary')
            ? ALL_TIME
            : SPORTS,
      ),
    );
    await renderScreen();

    expect(screen.getByTestId('setting-gps-mode')).toHaveTextContent(/réglage de référence/);
    await fireEvent.press(screen.getByTestId('chip-saver'));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/api/v1/users/me/preferences', {
        method: 'PATCH',
        body: { gpsMode: 'saver' },
      }),
    );
    expect(await screen.findByText(/Moins de points/)).toBeOnTheScreen();
  });
});

