/**
 * PR #80 review: logout clears the account's cached data.
 *
 * No query key carries the account's identity. Without this cleanup, the next account on
 * the same phone would briefly see the previous one's history and statistics while
 * reloading, and the persisted history would survive a restart.
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

it('clears the memory cache and the persisted cache', async () => {
  expect(await AsyncStorage.getItem('stracks.query-cache')).not.toBeNull();

  await clearUserCache();

  expect(queryClient.getQueryData(['activities', 'all', 0])).toBeUndefined();
  expect(queryClient.getQueryData(['stats', 'records', 'running'])).toBeUndefined();
  expect(await AsyncStorage.getItem('stracks.query-cache')).toBeNull();
});

it('is triggered by logout', async () => {
  useAuthStore.setState({ token: 'jwt', refreshToken: 'refresh', user: null });

  useAuthStore.getState().logout();

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(queryClient.getQueryData(['activities', 'all', 0])).toBeUndefined();
  expect(queryClient.getQueryData(['stats', 'records', 'running'])).toBeUndefined();
});
