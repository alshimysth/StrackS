/**
 * Revue PR #80 : la déconnexion efface les données du compte mises en cache.
 *
 * Aucune clé de requête ne porte l'identité du compte. Sans ce ménage, le compte suivant
 * sur le même téléphone verrait, le temps d'un rechargement, l'historique et les
 * statistiques du précédent — et l'historique persisté survivrait à un redémarrage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearUserCache, persistOptions, queryClient } from '../../api/query-client';
import { useAuthStore } from '../use-auth-store';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 }) as unknown as typeof fetch;
  queryClient.setQueryData(['activities', 'all', 0], { items: ['séance du compte A'] });
  queryClient.setQueryData(['stats', 'records', 'running'], { bySport: ['record du compte A'] });
  await persistOptions.persister.persistClient({
    timestamp: Date.now(),
    buster: 'v1',
    clientState: { mutations: [], queries: [] },
  });
});

afterEach(() => {
  queryClient.clear();
});

it('vide le cache mémoire et le cache persisté', async () => {
  expect(await AsyncStorage.getItem('stracks.query-cache')).not.toBeNull();

  await clearUserCache();

  expect(queryClient.getQueryData(['activities', 'all', 0])).toBeUndefined();
  expect(queryClient.getQueryData(['stats', 'records', 'running'])).toBeUndefined();
  expect(await AsyncStorage.getItem('stracks.query-cache')).toBeNull();
});

it('est déclenché par la déconnexion', async () => {
  useAuthStore.setState({ token: 'jwt', refreshToken: 'refresh', user: null });

  useAuthStore.getState().logout();

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(queryClient.getQueryData(['activities', 'all', 0])).toBeUndefined();
  expect(queryClient.getQueryData(['stats', 'records', 'running'])).toBeUndefined();
});
