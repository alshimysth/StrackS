/**
 * Client react-query du socle et persistance du cache (Story #27).
 *
 * Le PRD garantit qu'une séance ne se perd jamais, mais jusqu'ici la *consultation*
 * exigeait le réseau. Persister le cache rend l'historique déjà consulté lisible en
 * zone blanche.
 *
 * Ce qui est persisté est volontairement restreint : seules les listes et fiches
 * d'activités. Le profil et les préférences ne sont pas écrits sur le disque —
 * AsyncStorage n'est pas chiffré, contrairement au `expo-secure-store` qui garde
 * les jetons. Le filtre est une liste blanche : une future clé de requête n'atterrit
 * pas sur le disque par défaut, il faut l'y inscrire délibérément.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, type Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

/** Durée au-delà de laquelle un cache disque est jeté plutôt que réaffiché. */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `gcTime` doit dépasser `CACHE_MAX_AGE_MS` : react-query refuse de restaurer une
 * requête déjà expirée côté mémoire, et un `gcTime` par défaut (5 min) viderait le
 * cache disque à la première réhydratation — la persistance ne servirait à rien.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: CACHE_MAX_AGE_MS,
      staleTime: 30_000,
      /**
       * Hors ligne, react-query met la requête en pause au lieu d'échouer (`onlineManager`
       * est câblé dans core/network). Inutile d'insister davantage quand le serveur, lui,
       * a bien répondu une erreur.
       */
      retry: 2,
    },
  },
});

/** Clés de requête dont le contenu a le droit d'être écrit sur le disque. */
const PERSISTED_QUERY_PREFIXES = ['activities', 'activity'];

function isPersistable(query: Query): boolean {
  const root = query.queryKey[0];
  return typeof root === 'string' && PERSISTED_QUERY_PREFIXES.includes(root);
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createAsyncStoragePersister({
    storage: AsyncStorage,
    key: 'stracks.query-cache',
    throttleTime: 2_000,
  }),
  maxAge: CACHE_MAX_AGE_MS,
  /**
   * Change de valeur à chaque évolution de forme des données mises en cache.
   * Sans ça, une ancienne entrée de disque serait réhydratée dans un écran qui
   * n'attend plus la même structure.
   */
  buster: 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === 'success' && isPersistable(query),
  },
};
