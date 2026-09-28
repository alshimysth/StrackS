/**
 * Section Préférences du profil (#7) — comportement en cas d'échec d'enregistrement.
 *
 * Signalé en revue : le bandeau d'erreur ne peut décrire qu'UNE mutation. Si un PATCH
 * échoue et qu'un second réussit, `update.isError` ne reflète plus que le second, et
 * le premier choix est perdu sans un mot. Le garde-fou retenu est de bloquer les puces
 * pendant l'enregistrement — il ne peut donc jamais y avoir deux PATCH en vol.
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
 * Le registre est stubé : l'écran ne s'en sert que pour filtrer les sports démarrables,
 * mais l'importer tire tout le moteur de séance derrière lui — donc `expo-sqlite`,
 * absent sous jest.
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

/** Totaux du profil (#7) : servis par chemin, ils ne sont pas le sujet de cette suite. */
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

describe('Préférences — échec d’enregistrement', () => {
  it('affiche une erreur exploitable quand le PATCH échoue', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('preferences-section')).toBeOnTheScreen());

    mockApi.mockRejectedValueOnce(new ApiError({ title: 'Panne', status: 503, detail: 'ko' }));
    await fireEvent.press(screen.getByTestId('chip-imperial'));

    await waitFor(() =>
      expect(screen.getByTestId('preferences-update-error')).toBeOnTheScreen(),
    );
  });

  /**
   * Le cœur du garde-fou : tant qu'un enregistrement est en vol, aucun second choix
   * ne part. Sans ça, le succès du second effacerait l'erreur du premier.
   *
   * La mutation est retenue par une promesse qu'on résout à la main en fin de test —
   * une promesse jamais résolue laisserait jest suspendu.
   */
  it('bloque les puces pendant l’enregistrement', async () => {
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

  it('réessaie le même patch depuis le bandeau d’erreur', async () => {
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

describe('Mode GPS (#36)', () => {
  it('enregistre le mode choisi et en explique l’effet', async () => {
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
    expect(await screen.findByText(/Un point toutes les 3 s/)).toBeOnTheScreen();
  });
});

