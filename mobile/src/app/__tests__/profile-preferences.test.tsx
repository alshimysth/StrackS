/**
 * Section Préférences du profil (#7) — comportement en cas d'échec d'enregistrement.
 *
 * Signalé en revue : le bandeau d'erreur ne peut décrire qu'UNE mutation. Si un PATCH
 * échoue et qu'un second réussit, `update.isError` ne reflète plus que le second, et
 * le premier choix est perdu sans un mot. Le garde-fou retenu est de bloquer les puces
 * pendant l'enregistrement — il ne peut donc jamais y avoir deux PATCH en vol.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import ProfileScreen from '../(tabs)/profile';
import { ApiError } from '../../core/api/client';
import { DEFAULT_PREFERENCES } from '../../core/preferences/schema';
import { QUERY_KEY } from '../../core/preferences/use-preferences';

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

jest.mock('../../core/api/use-auth', () => ({
  useProfile: () => ({ data: { displayName: 'Testeur', email: 't@example.com' } }),
  useDeleteAccount: () => ({ mutate: jest.fn() }),
}));

const SPORTS = [
  { code: 'running', label: 'Course', usesGps: true, schemaVersion: 1 },
  { code: 'walking', label: 'Marche', usesGps: true, schemaVersion: 1 },
];

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData(QUERY_KEY, DEFAULT_PREFERENCES);
  client.setQueryData(['sport-types'], SPORTS);
  mockApi.mockResolvedValue(SPORTS);
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
