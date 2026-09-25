/**
 * Accès aux préférences (#56) : la lecture ne casse jamais l'écran, l'écriture ne
 * corrompt jamais le cache.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import { createTestQueryClient } from '../../../test-support/query-client';
import { DEFAULT_PREFERENCES } from '../schema';
import { QUERY_KEY, usePreferences, useUpdatePreferences } from '../use-preferences';

const mockApi = jest.fn();

jest.mock('../../api/client', () => ({
  ...jest.requireActual('../../api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = createTestQueryClient();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('usePreferences', () => {
  it('sert les défauts pendant le chargement', async () => {
    mockApi.mockReturnValue(new Promise(() => undefined));
    const { result } = await renderHook(() => usePreferences(), { wrapper: Wrapper });
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('sert la réponse du serveur une fois parsée', async () => {
    mockApi.mockResolvedValue({ theme: 'dark' });
    const { result } = await renderHook(() => usePreferences(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.preferences.theme).toBe('dark');
    expect(result.current.preferences.units).toBe('metric');
  });

  /** Une préférence est un confort : un document inattendu ne bloque pas l'écran. */
  it('sert les défauts sur une réponse inattendue, sans passer en erreur', async () => {
    mockApi.mockResolvedValue({ theme: 'sepia', units: 42 });
    const { result } = await renderHook(() => usePreferences(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('useUpdatePreferences', () => {
  it('envoie le patch épars et met le cache à jour depuis la réponse complète', async () => {
    client.setQueryData(QUERY_KEY, DEFAULT_PREFERENCES);
    mockApi.mockResolvedValue({ ...DEFAULT_PREFERENCES, units: 'imperial' });
    const { result } = await renderHook(() => useUpdatePreferences(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ units: 'imperial' });
    });

    expect(mockApi).toHaveBeenCalledWith('/api/v1/users/me/preferences', {
      method: 'PATCH',
      body: { units: 'imperial' },
    });
    expect(client.getQueryData(QUERY_KEY)).toMatchObject({ units: 'imperial' });
  });

  it('invalide plutôt que d’écrire une réponse illisible dans le cache', async () => {
    client.setQueryData(QUERY_KEY, DEFAULT_PREFERENCES);
    mockApi.mockResolvedValue({ units: 'furlongs' });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useUpdatePreferences(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ units: 'imperial' });
    });

    expect(client.getQueryData(QUERY_KEY)).toEqual(DEFAULT_PREFERENCES);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: QUERY_KEY });
  });
});
