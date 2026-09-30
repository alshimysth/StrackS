/**
 * Sections added to the profile by lot 3: totals (#7), weight (#32), privacy zones (#37),
 * GPS mode (#36), avatar (#7).
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import { AllTimeStats } from '../../core/profile/AllTimeStats';
import { PhysicalProfile } from '../../core/profile/PhysicalProfile';
import { PrivacyZones } from '../../core/profile/PrivacyZones';
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type PrivacyZone as PrivacyZoneT,
} from '../../core/preferences/schema';
import { haversineM } from '../../core/session/metrics';
import { QUERY_KEY } from '../../core/preferences/use-preferences';
import { initialsOf } from '../../design-system/components/Avatar';
import { createTestQueryClient } from '../../test-support/query-client';

const mockApi = jest.fn();
const mockPosition = jest.fn();

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

jest.mock('../../core/gps/position', () => ({
  getCurrentPosition: () => mockPosition(),
}));

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function withPreferences(patch: Partial<Preferences>) {
  client.setQueryData(QUERY_KEY, { ...DEFAULT_PREFERENCES, ...patch });
}

function summary(totalSessions: number, totals: Record<string, number>) {
  return {
    from: '1970-01-01T00:00:00Z',
    to: '2026-09-28T00:00:00Z',
    bySport: [],
    totalSessions,
    totalDurationS: 45 * 3600 + 12 * 60,
    totals,
    previous: { sessions: 0, durationS: 0, totals: {} },
  };
}

/** The server returns the full document after a PATCH: we return the merged patch. */
function echoPatches() {
  mockApi.mockImplementation((path: string, options?: { body?: Partial<Preferences> }) =>
    Promise.resolve({ ...DEFAULT_PREFERENCES, ...(options?.body ?? {}) }),
  );
}

const patches = () =>
  mockApi.mock.calls
    .filter(([path, options]) => path === '/api/v1/users/me/preferences' && options?.method === 'PATCH')
    .map(([, options]) => options.body);

beforeEach(() => {
  client = createTestQueryClient();
  withPreferences({});
  mockApi.mockReset();
  mockPosition.mockReset();
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('All-time totals (#7)', () => {
  it('shows sessions, total time and distance aggregated by the server', async () => {
    mockApi.mockResolvedValue(summary(42, { distanceM: 321_000 }));
    await render(<AllTimeStats />, { wrapper: Wrapper });

    expect(await screen.findByTestId('all-time-sessions')).toHaveTextContent(/42/);
    expect(screen.getByTestId('all-time-duration')).toHaveTextContent(/45 h 12 min/);
    expect(screen.getByTestId('all-time-distance')).toHaveTextContent(/321/);
    expect(mockApi).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/v1\/stats\/summary\?period=all/));
  });

  /** The core doesn't know that a sport "has" a distance: no key, no card. */
  it('does not invent a distance when no practised sport declares one', async () => {
    mockApi.mockResolvedValue(summary(3, {}));
    await render(<AllTimeStats />, { wrapper: Wrapper });

    expect(await screen.findByTestId('all-time-sessions')).toBeOnTheScreen();
    expect(screen.queryByTestId('all-time-distance')).toBeNull();
  });

  it('invites to a first session rather than showing zeros', async () => {
    mockApi.mockResolvedValue(summary(0, {}));
    await render(<AllTimeStats />, { wrapper: Wrapper });
    expect(await screen.findByTestId('all-time-empty')).toBeOnTheScreen();
  });
});

describe('Weight (#32)', () => {
  it('explains what the weight is for', async () => {
    await render(<PhysicalProfile />, { wrapper: Wrapper });
    expect(screen.getByText(/Sert uniquement à estimer les calories/)).toBeOnTheScreen();
  });

  /**
   * PR #80 review: only the weight goes out. Copying the other fields from a state not
   * yet loaded would send `null`s, which the server reads as "clear".
   */
  it('only sends the weight, never the other physical data', async () => {
    withPreferences({ physical: { ...DEFAULT_PREFERENCES.physical, heightCm: 180 } });
    echoPatches();
    await render(<PhysicalProfile />, { wrapper: Wrapper });

    await fireEvent.changeText(screen.getByTestId('weight-input'), '72,5');
    await fireEvent.press(screen.getByText('Enregistrer le poids'));

    await waitFor(() => expect(patches()).toEqual([{ physical: { weightKg: 72.5 } }]));
  });

  it('enters pounds in imperial and stores kg', async () => {
    withPreferences({ units: 'imperial' });
    echoPatches();
    await render(<PhysicalProfile />, { wrapper: Wrapper });

    expect(screen.getByText('Poids (lb)')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('weight-input'), '158.7');
    await fireEvent.press(screen.getByText('Enregistrer le poids'));

    await waitFor(() => expect(patches()[0]).toMatchObject({ physical: { weightKg: 72 } }));
  });

  /** Same bounds as the server (30–300 kg): the front end rejects before sending. */
  it.each(['12', '420', 'soixante', ''])('rejects "%s" without a server call', async (input) => {
    await render(<PhysicalProfile />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('weight-input'), input);
    await fireEvent.press(screen.getByText('Enregistrer le poids'));

    expect(await screen.findByText(/Saisis un poids entre 30 et 300 kg/)).toBeOnTheScreen();
    expect(patches()).toEqual([]);
  });

  it('allows removing the weight', async () => {
    withPreferences({ physical: { ...DEFAULT_PREFERENCES.physical, weightKg: 70 } });
    echoPatches();
    await render(<PhysicalProfile />, { wrapper: Wrapper });

    expect(screen.getByTestId('weight-input').props.value).toBe('70');
    await fireEvent.press(screen.getByText('Retirer'));
    await waitFor(() => expect(patches()[0]).toMatchObject({ physical: { weightKg: null } }));
  });
});

describe('Privacy zones (#37)', () => {
  it('says the track stays recorded: masked is not deleted', async () => {
    await render(<PrivacyZones />, { wrapper: Wrapper });
    expect(screen.getByText(/reste enregistré en entier/)).toBeOnTheScreen();
  });

  /** Randomly offset centre (PR #80 review): the real position is never sent. */
  it('adds a zone covering the current position without being centred on it', async () => {
    mockPosition.mockResolvedValue({ lat: 48.8566123, lng: 2.3522219, accuracyM: 8 });
    echoPatches();
    await render(<PrivacyZones />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByTestId('chip-200'));
    await fireEvent.press(screen.getByText('Masquer autour de ma position actuelle'));

    await waitFor(() => expect(patches()).toHaveLength(1));
    const [zone] = (patches()[0] as { privacyZones: PrivacyZoneT[] }).privacyZones;
    expect(zone).toMatchObject({ radiusM: 200, label: 'Domicile' });
    const offset = haversineM(48.8566123, 2.3522219, zone.lat, zone.lng);
    expect(offset).toBeLessThanOrEqual(0.3 * 200 + 1); // real position covered
    expect(String(zone.lat).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(5);
  });

  /**
   * PR #80 review: two removals before the first one's response. Computed from the same
   * render, the second PATCH would send back the zone the first had just removed.
   */
  it('chains two quick removals without the second cancelling the first', async () => {
    withPreferences({
      privacyZones: [
        { lat: 1, lng: 1, radiusM: 500, label: 'Domicile' },
        { lat: 2, lng: 2, radiusM: 500, label: 'Zone 2' },
        { lat: 3, lng: 3, radiusM: 500, label: 'Zone 3' },
      ],
    });
    // Slow response: both taps happen before the first PATCH comes back.
    mockApi.mockImplementation(
      (path: string, options?: { body?: Partial<Preferences> }) =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ...DEFAULT_PREFERENCES, ...(options?.body ?? {}) }), 50);
        }),
    );
    await render(<PrivacyZones />, { wrapper: Wrapper });

    // The user taps what's on screen: the first "Retirer" twice.
    await fireEvent.press(screen.getAllByText('Retirer')[0]);
    await fireEvent.press(screen.getAllByText('Retirer')[0]);

    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]).toEqual({ privacyZones: [{ lat: 3, lng: 3, radiusM: 500, label: 'Zone 3' }] });
  });

  it('removes a zone by sending the remaining list', async () => {
    withPreferences({
      privacyZones: [
        { lat: 1, lng: 1, radiusM: 500, label: 'Domicile' },
        { lat: 2, lng: 2, radiusM: 500, label: 'Zone 2' },
      ],
    });
    echoPatches();
    await render(<PrivacyZones />, { wrapper: Wrapper });

    await fireEvent.press(screen.getAllByText('Retirer')[0]);
    await waitFor(() =>
      expect(patches()).toEqual([{ privacyZones: [{ lat: 2, lng: 2, radiusM: 500, label: 'Zone 2' }] }]),
    );
  });

  it('shows a location refusal without saving anything', async () => {
    mockPosition.mockRejectedValue(new Error('Permission de localisation refusée — active-la dans les réglages.'));
    await render(<PrivacyZones />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByText('Masquer autour de ma position actuelle'));
    expect(await screen.findByTestId('privacy-error')).toHaveTextContent(/Permission de localisation refusée/);
    expect(patches()).toEqual([]);
  });

  it('no longer offers adding beyond five zones', async () => {
    withPreferences({
      privacyZones: [1, 2, 3, 4, 5].map((i) => ({ lat: i, lng: i, radiusM: 500, label: null })),
    });
    await render(<PrivacyZones />, { wrapper: Wrapper });
    expect(screen.queryByText('Masquer autour de ma position actuelle')).toBeNull();
    expect(screen.getByText('5 zones au maximum.')).toBeOnTheScreen();
  });
});

describe('Avatar (#7)', () => {
  it.each([
    ['Marie Curie', 'm@example.com', 'MC'],
    ['Jean-Paul Sartre de Beauvoir', null, 'JB'],
    ['Zoé', null, 'ZO'],
    [null, 'coureur@example.com', 'C'],
    ['   ', null, '?'],
    // PR #80 review: an emoji is a single character, never half of a UTF-16 pair.
    ['😀 Alice', null, '😀A'],
    ['😀', null, '😀'],
    [null, '😀@example.com', '😀'],
  ])('%s / %s → %s', (name, email, expected) => {
    expect(initialsOf(name, email)).toBe(expected);
  });
});

describe('Display name (#7)', () => {
  const { DisplayName } = jest.requireActual('../../core/profile/DisplayName');

  /**
   * PR #85 review: the parent reads the user from the `['me']` cache, like the Profile
   * screen through `useProfile`. What counts is the name actually shown after saving.
   */
  function ProfileLike() {
    const { useQuery } = jest.requireActual('@tanstack/react-query');
    const me = useQuery({ queryKey: ['me'], queryFn: () => client.getQueryData(['me']), staleTime: Infinity });
    return <DisplayName value={me.data?.displayName} />;
  }

  it('changes the name and shows the new name', async () => {
    const updated = { id: 'u', email: 'a@example.com', displayName: 'Marie', createdAt: '2026-01-01T00:00:00Z' };
    client.setQueryData(['me'], { ...updated, displayName: 'Ancien nom' });
    mockApi.mockResolvedValue(updated);
    await render(<ProfileLike />, { wrapper: Wrapper });
    expect(screen.getByTestId('display-name')).toHaveTextContent('Ancien nom');

    await fireEvent.press(screen.getByText('Modifier'));
    await fireEvent.changeText(screen.getByTestId('display-name-input'), '  Marie  ');
    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/api/v1/users/me', { method: 'PATCH', body: { displayName: 'Marie' } }),
    );
    expect(client.getQueryData(['me'])).toEqual(updated);
    await waitFor(() => expect(screen.getByTestId('display-name')).toHaveTextContent('Marie'));
  });

  it('clears the error as soon as the input is corrected', async () => {
    mockApi.mockRejectedValueOnce(new (jest.requireActual('../../core/api/client').ApiError)({
      status: 400, title: 'Requête invalide', detail: 'Nom refusé par le serveur.',
    }));
    await render(<DisplayName value="Ancien nom" />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByText('Modifier'));
    await fireEvent.press(screen.getByText('Enregistrer'));
    expect(await screen.findByText('Nom refusé par le serveur.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('display-name-input'), 'Marie');
    expect(screen.queryByText('Nom refusé par le serveur.')).toBeNull();
  });

  it('cancels without sending anything', async () => {
    await render(<DisplayName value="Ancien nom" />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByText('Modifier'));
    await fireEvent.press(screen.getByText('Annuler'));
    expect(screen.getByTestId('display-name')).toHaveTextContent('Ancien nom');
    expect(mockApi).not.toHaveBeenCalled();
  });
});
