/**
 * Access to user preferences. The single entry point: no screen may call
 * `/users/me/preferences` directly.
 *
 * Reading never fails on the UI side: if the network or parsing breaks, the defaults are
 * served. A preference is a comfort; refusing to show a screen because the chosen theme is
 * unknown would be disproportionate.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import {
  DEFAULT_PREFERENCES,
  preferencesSchema,
  type Preferences,
  type PreferencesPatch,
} from './schema';

/** Exported so tests can prefill the cache without a network call. */
export const QUERY_KEY = ['preferences'] as const;

async function fetchPreferences(): Promise<Preferences> {
  const raw = await api<unknown>('/api/v1/users/me/preferences');
  const parsed = preferencesSchema.safeParse(raw);
  if (!parsed.success) {
    // The backend returned something unexpected: that doesn't stop the user from using
    // the app.
    console.warn('[preferences] unexpected response, defaults applied', parsed.error.issues);
    return DEFAULT_PREFERENCES;
  }
  return parsed.data;
}

/** Current preferences, with defaults while loading. */
export function usePreferences() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPreferences,
    staleTime: 5 * 60 * 1000,
  });
  return {
    ...query,
    preferences: query.data ?? DEFAULT_PREFERENCES,
  };
}

/**
 * Partial update. Only sends the changed keys; the server merges. Passing `null` on a key
 * resets it to its default.
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: PreferencesPatch) =>
      api<unknown>('/api/v1/users/me/preferences', { method: 'PATCH', body: patch }),
    /**
     * Serialized PATCHes (#66, review). Two distinct safeguards, not redundant:
     *  - callers send SPARSE patches, so only their intent and never a rebuilt snapshot:
     *    that's what protects the stored data;
     *  - this queue guarantees a single request in flight, so the cache ends on the latest
     *    server state: each response is a FULL object, and two out-of-order responses
     *    would otherwise put the cache back into an earlier state.
     */
    scope: { id: 'preferences' },
    onSuccess: (raw) => {
      const parsed = preferencesSchema.safeParse(raw);
      if (parsed.success) {
        queryClient.setQueryData(QUERY_KEY, parsed.data);
      } else {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      }
    },
  });
}
