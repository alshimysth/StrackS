/**
 * Lecture et édition d'une activité (#6, #22, #25, #26).
 *
 * Les clés `['activity', id]` et `['track-points', id]` sont séparées : le tracé pèse
 * des milliers de points et ne change jamais après la fin de séance, alors que la fiche
 * bouge à chaque renommage. Les fusionner ferait recharger le tracé à chaque édition.
 *
 * Seule `activity` est persistée sur disque (liste blanche de `query-client.ts`) —
 * le tracé y tiendrait mal et se recharge vite.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LatLng } from 'react-native-maps';

import type { Activity } from '../../types/api';
import { deleteActivity, getActivity, getTrackPoints, updateActivity } from './activities';

export function useActivity(id: string | undefined) {
  return useQuery({
    queryKey: ['activity', id],
    queryFn: () => getActivity(id as string),
    enabled: id != null,
  });
}

export function useTrackPoints(id: string | undefined) {
  return useQuery({
    queryKey: ['track-points', id],
    queryFn: () => getTrackPoints(id as string),
    enabled: id != null,
    // Le tracé d'une séance terminée est immuable : le réinterroger ne peut rien
    // apprendre de neuf, et il coûte cher à transporter.
    staleTime: Infinity,
  });
}

/** Points GPS → coordonnées de carte, dans l'ordre d'enregistrement. */
export function toPath(points: { lat: number; lng: number }[]): LatLng[] {
  return points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
}

/**
 * Renommage / notes, en mise à jour optimiste (#25).
 *
 * L'optimisme se justifie ici : renommer est une action anodine dont l'utilisateur
 * connaît déjà le résultat. Attendre l'aller-retour donnerait un champ qui « saute ».
 * En cas d'échec, l'état précédent est remis — d'où sa capture dans `onMutate`.
 */
export function useUpdateActivity(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: { title?: string; notes?: string }) => updateActivity(id, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['activity', id] });
      const previous = queryClient.getQueryData<Activity>(['activity', id]);
      if (previous != null) {
        queryClient.setQueryData<Activity>(['activity', id], {
          ...previous,
          // Le serveur convertit une chaîne vide (ou blanche) en null : l'optimiste
          // doit appliquer la même règle, sinon l'écran affiche brièvement un titre
          // vide là où la valeur finale sera « pas de titre ».
          ...(patch.title !== undefined ? { title: patch.title.trim() || null } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        });
      }
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(['activity', id], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['activity', id] });
      // L'historique affiche le titre : le laisser périmé montrerait l'ancien nom
      // jusqu'au prochain pull-to-refresh.
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/**
 * Suppression (#26). Pas d'optimisme ici, à l'inverse du renommage : l'action est
 * irréversible et en cascade sur le tracé. Retirer la ligne avant confirmation du
 * serveur, puis la faire réapparaître sur échec, serait franchement inquiétant.
 */
export function useDeleteActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteActivity(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: ['activity', id] });
      queryClient.removeQueries({ queryKey: ['track-points', id] });
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      // Les stats agrègent les activités : une séance supprimée doit en sortir
      // (DoD #26), même si l'écran n'existe pas encore — il arrive avec le lot H.
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
