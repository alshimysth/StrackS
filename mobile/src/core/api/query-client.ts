/**
 * Core react-query client and cache persistence (story #27).
 *
 * The PRD guarantees a session is never lost, but until now *browsing* required the
 * network. Persisting the cache makes already viewed history readable without coverage.
 *
 * What is persisted is deliberately restricted: only activity lists and details. Profile
 * and preferences aren't written to disk: AsyncStorage isn't encrypted, unlike the
 * `expo-secure-store` that keeps the tokens. The filter is an allow list: a future query
 * key doesn't land on disk by default, it has to be added deliberately.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isServer, QueryClient, type Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

/** Age beyond which a disk cache is dropped rather than shown again. */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `gcTime` must exceed `CACHE_MAX_AGE_MS`: react-query refuses to restore a query already
 * expired in memory, and a default `gcTime` (5 min) would empty the disk cache on the
 * first rehydration, making persistence useless.
 *
 * Except on the server: the static web export renders every route in Node, and each query
 * built there arms a 7-day garbage-collection timer that keeps `expo export` alive once
 * done (SDK 55+ no longer force-exits on pending timers). `Infinity` arms no timer, which
 * is react-query's own server default.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: isServer ? Infinity : CACHE_MAX_AGE_MS,
      staleTime: 30_000,
      /**
       * Offline, react-query pauses the query instead of failing (`onlineManager` is wired
       * in core/network). No point insisting further when the server did answer an error.
       */
      retry: 2,
    },
  },
});

/** Query keys whose content may be written to disk. */
const PERSISTED_QUERY_PREFIXES = ['activities', 'activity'];

function isPersistable(query: Query): boolean {
  const root = query.queryKey[0];
  return typeof root === 'string' && PERSISTED_QUERY_PREFIXES.includes(root);
}

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'stracks.query-cache',
  throttleTime: 2_000,
});

/**
 * Clears everything the current account cached, in memory AND on disk.
 *
 * Called on logout (PR #80 review). No query key carries the account's identity: without
 * this cleanup, the next account on the same phone would briefly see the previous one's
 * history, statistics and records while reloading, and the persisted history would even
 * survive an app restart.
 */
export async function clearUserCache(): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
  await persister.removeClient();
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: CACHE_MAX_AGE_MS,
  /**
   * Changes value whenever the shape of the cached data changes. Otherwise an old disk
   * entry would be rehydrated into a screen that no longer expects the same structure.
   */
  buster: 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === 'success' && isPersistable(query),
  },
};
