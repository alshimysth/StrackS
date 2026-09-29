/**
 * Activity detail screen (#6) and confirmed deletion (#26).
 *
 * This test targets the acceptance criteria: the detail opens and shows the metrics,
 * deletion requires a confirmation, and the screen is only left once the server agrees.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import { Alert } from 'react-native';

import ActivityDetailScreen from '../activity/[id]';
import { ApiError } from '../../core/api/client';
import type { Activity } from '../../types/api';
import { createTestQueryClient } from '../../test-support/query-client';

const mockApi = jest.fn();
const mockBack = jest.fn();

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'act-1' }),
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
}));

// react-native-maps is native: jest-expo doesn't transform it.
jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View, Polyline: View, Marker: View };
});

/**
 * The sports registry is stubbed rather than loaded.
 *
 * The detail screen only depends on the modules through `SummaryPanel`, but importing the
 * real registry pulls the whole session engine behind it (`SessionTrackingScreen`, the
 * SQLite buffer, the uploader) for a screen that only reads. Under jest that requires
 * `expo-sqlite` and leaves the worker open after the suite.
 *
 * What the stub checks is still the essential part: that the core does go through the
 * sport's module instead of hard-coding its metrics.
 */
jest.mock('../../sports/registry', () => {
  const { Text } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  const panel = ({ activity }: { activity: { sportType: string } }) =>
    React.createElement(Text, { testID: 'sport-panel' }, `panneau ${activity.sportType}`);
  return {
    sportRegistry: {
      running: { code: 'running', label: 'Course', SummaryPanel: panel },
      walking: { code: 'walking', label: 'Marche', SummaryPanel: panel },
    },
  };
});

const ACTIVITY: Activity = {
  id: 'act-1',
  sportType: 'running',
  status: 'completed',
  startedAt: '2026-08-14T09:30:00.000Z',
  endedAt: '2026-08-14T10:10:00.000Z',
  durationS: 2400,
  distanceM: 8000,
  calories: 520,
  title: null,
  notes: 'Vent de face au retour',
  metrics: {
    schemaVersion: 1,
    avgPaceSecPerKm: 300,
    splits: [
      { km: 1, paceSecPerKm: 298 },
      { km: 2, paceSecPerKm: 305 },
    ],
  },
};

function respond(overrides: { activity?: unknown; track?: unknown; preferences?: unknown } = {}) {
  mockApi.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me/preferences') {
      return Promise.resolve(overrides.preferences ?? {});
    }
    if (path.endsWith('/track-points')) {
      const track = overrides.track ?? [
        { seq: 0, recordedAt: ACTIVITY.startedAt, lat: 45.0, lng: 5.0, altitudeM: 200, accuracyM: 5 },
        { seq: 1, recordedAt: ACTIVITY.startedAt, lat: 45.01, lng: 5.0, altitudeM: 210, accuracyM: 5 },
      ];
      return track instanceof Error ? Promise.reject(track) : Promise.resolve(track);
    }
    const activity = overrides.activity ?? ACTIVITY;
    return activity instanceof Error ? Promise.reject(activity) : Promise.resolve(activity);
  });
}

/**
 * The client is kept so it can be cleared after each test. Its configuration comes from
 * `createTestQueryClient`: that's what prevents the mutations' garbage-collection timers
 * from outliving the suite (#65).
 */
let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderScreen = () => render(<ActivityDetailScreen />, { wrapper: Wrapper });

/**
 * Presses an `Alert.alert` button by its label.
 *
 * Wrapped in `act`: the callback starts a mutation, hence a render, and React has no way
 * of knowing that a native modal press comes from the user.
 */
async function pressAlertButton(label: string) {
  const spy = Alert.alert as unknown as jest.Mock;
  const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as {
    text: string;
    onPress?: () => void;
  }[];
  const button = buttons.find((b) => b.text === label);
  await act(async () => {
    button?.onPress?.();
  });
}

beforeEach(() => {
  client = createTestQueryClient();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('Activity detail (#6)', () => {
  it('shows the session metrics', async () => {
    respond();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    expect(screen.getByText('8,00')).toBeOnTheScreen(); // distance in km
    expect(screen.getByText('40:00')).toBeOnTheScreen(); // duration
    expect(screen.getByText('520')).toBeOnTheScreen(); // calories
  });

  it('shows the derived label when the session has no title', async () => {
    respond();
    await renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('activity-title')).toHaveTextContent('Course du 14 août'),
    );
  });

  it('shows the chosen title when it exists', async () => {
    respond({ activity: { ...ACTIVITY, title: 'Sortie longue' } });
    await renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('activity-title')).toHaveTextContent('Sortie longue'),
    );
  });

  it('shows the track and the splits', async () => {
    respond();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('route-map')).toBeOnTheScreen());
    expect(screen.getByTestId('splits-list')).toBeOnTheScreen();
    expect(screen.getByTestId('split-1')).toBeOnTheScreen();
  });

  /** The core delegates the sport-specific metrics to the module, never an `if`. */
  it('delegates the specific panel to the sport module', async () => {
    respond();
    await renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('sport-panel')).toHaveTextContent('panneau running'),
    );
  });

  /** A walking session has no splits: the section must not show up empty. */
  it('shows no splits section without splits', async () => {
    respond({ activity: { ...ACTIVITY, sportType: 'walking', metrics: { schemaVersion: 1 } } });
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    expect(screen.queryByTestId('splits-list')).toBeNull();
  });

  it('shows no map frame without a track', async () => {
    respond({ track: [] });
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    expect(screen.queryByTestId('route-map')).toBeNull();
  });

  it('allows going back to the history', async () => {
    respond();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('back')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows an actionable error state if the session does not load', async () => {
    respond({ activity: new ApiError({ title: 'Panne', status: 503, detail: 'ko' }) });
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-state-server')).toBeOnTheScreen());
  });
});

describe('Privacy zones (#37)', () => {
  /** The test track starts at (45, 5) and heads north: a 500 m zone at the start. */
  const home = { lat: 45.0, lng: 5.0, radiusM: 500, label: 'Domicile' };

  it('warns that portions are masked and that the track stays complete', async () => {
    respond({
      preferences: { privacyZones: [home] },
      track: [
        { seq: 0, recordedAt: ACTIVITY.startedAt, lat: 45.0, lng: 5.0, altitudeM: 200, accuracyM: 5 },
        { seq: 1, recordedAt: ACTIVITY.startedAt, lat: 45.01, lng: 5.0, altitudeM: 210, accuracyM: 5 },
        { seq: 2, recordedAt: ACTIVITY.startedAt, lat: 45.02, lng: 5.0, altitudeM: 210, accuracyM: 5 },
      ],
    });
    await renderScreen();

    expect(await screen.findByTestId('privacy-masked')).toHaveTextContent(/figure dans ton export/);
    expect(screen.getByTestId('route-map')).toBeOnTheScreen(); // the rest of the track shows
  });

  it('shows no map when the whole track is in a zone', async () => {
    respond({ preferences: { privacyZones: [{ ...home, radiusM: 2000 }] } });
    await renderScreen();

    expect(await screen.findByTestId('privacy-masked')).toHaveTextContent(/n’est pas affiché/);
    expect(screen.queryByTestId('route-map')).toBeNull();
  });
});

/**
 * PR #80 review: until the zones are known, `usePreferences` serves defaults without any
 * zone. Drawing the track at that moment would show the start at home.
 */
it('does not draw the map until the privacy zones are loaded', async () => {
  respond();
  mockApi.mockImplementation((path: string) =>
    path === '/api/v1/users/me/preferences'
      ? new Promise(() => undefined) // preferences that never answer
      : path.endsWith('/track-points')
        ? Promise.resolve([
            { seq: 0, recordedAt: ACTIVITY.startedAt, lat: 45.0, lng: 5.0, altitudeM: 200, accuracyM: 5 },
            { seq: 1, recordedAt: ACTIVITY.startedAt, lat: 45.01, lng: 5.0, altitudeM: 210, accuracyM: 5 },
          ])
        : Promise.resolve(ACTIVITY),
  );
  await renderScreen();

  expect(await screen.findByTestId('map-pending')).toBeOnTheScreen();
  expect(screen.queryByTestId('route-map')).toBeNull();
});

describe('Calories (#33)', () => {
  it('explains the missing calories when the weight is not set', async () => {
    respond({ activity: { ...ACTIVITY, calories: null } });
    await renderScreen();
    expect(await screen.findByTestId('calories-missing')).toHaveTextContent(/Renseigne ton poids/);
  });

  it('does not show this prompt when the weight is known', async () => {
    respond({
      activity: { ...ACTIVITY, calories: null },
      preferences: { physical: { weightKg: 70 } },
    });
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByTestId('calories-missing')).toBeNull();
  });
});

describe('Deletion (#26)', () => {
  it('deletes nothing without confirmation', async () => {
    respond();
    await renderScreen();
    await waitFor(() => expect(screen.getByText('Supprimer')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Supprimer'));

    expect(Alert.alert).toHaveBeenCalled();
    expect(mockApi).not.toHaveBeenCalledWith(
      expect.stringContaining('act-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('calls the backend once the deletion is confirmed', async () => {
    respond();
    await renderScreen();
    await waitFor(() => expect(screen.getByText('Supprimer')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Supprimer'));
    mockApi.mockResolvedValueOnce(undefined);
    await pressAlertButton('Supprimer');

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        '/api/v1/activities/act-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  /**
   * The screen is only left after the server agrees: leaving right away then failing
   * would make the session reappear in the history without explanation.
   */
  it('does not leave the screen if the deletion fails', async () => {
    respond();
    await renderScreen();
    await waitFor(() => expect(screen.getByText('Supprimer')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Supprimer'));
    mockApi.mockRejectedValueOnce(new ApiError({ title: 'Panne', status: 503, detail: 'ko' }));
    await pressAlertButton('Supprimer');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Suppression impossible',
        expect.stringContaining('toujours là'),
      ),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });
});
