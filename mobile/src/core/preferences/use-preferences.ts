/**
 * Accès aux préférences utilisateur. Point d'entrée unique : aucun écran ne
 * doit appeler `/users/me/preferences` directement.
 *
 * La lecture ne échoue jamais côté UI — si le réseau ou le parsing tombe, on
 * sert les défauts. Une préférence est un confort ; refuser d'afficher un écran
 * parce qu'on ignore le thème choisi serait disproportionné.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import {
  DEFAULT_PREFERENCES,
  preferencesSchema,
  type Preferences,
  type PreferencesPatch,
} from './schema';

const QUERY_KEY = ['preferences'] as const;

async function fetchPreferences(): Promise<Preferences> {
  const raw = await api<unknown>('/api/v1/users/me/preferences');
  const parsed = preferencesSchema.safeParse(raw);
  if (!parsed.success) {
    // Le backend a renvoyé quelque chose d'inattendu : on n'empêche pas
    // l'utilisateur d'utiliser l'app pour autant.
    console.warn('[preferences] réponse inattendue, défauts appliqués', parsed.error.issues);
    return DEFAULT_PREFERENCES;
  }
  return parsed.data;
}

/** Préférences courantes, avec défauts pendant le chargement. */
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
 * Mise à jour partielle. Envoie uniquement les clés modifiées — le serveur
 * fusionne. Passer `null` sur une clé la remet à son défaut.
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: PreferencesPatch) =>
      api<unknown>('/api/v1/users/me/preferences', { method: 'PATCH', body: patch }),
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
