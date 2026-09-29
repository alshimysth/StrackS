/**
 * Reading and editing an activity (#6, #22, #25, #26).
 *
 * The `['activity', id]` and `['track-points', id]` keys are separate: the track weighs
 * thousands of points and never changes once the session is over, while the detail
 * changes on every rename. Merging them would reload the track on every edit.
 *
 * Only `activity` is persisted to disk (allow list in `query-client.ts`); the track would
 * fit poorly there and reloads quickly.
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
    // A completed session's track is immutable: querying it again can't teach anything
    // new, and it's expensive to transfer.
    staleTime: Infinity,
  });
}

/** GPS points → map coordinates, in recording order. */
export function toPath(points: { lat: number; lng: number }[]): LatLng[] {
  return points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
}

/**
 * Rename / notes, as an optimistic update (#25).
 *
 * Optimism is justified here: renaming is a harmless action whose result the user
 * already knows. Waiting for the round trip would make the field "jump". On failure,
 * the previous state is restored, hence capturing it in `onMutate`.
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
          // The server turns an empty (or blank) string into null: the optimistic update
          // must apply the same rule, otherwise the screen briefly shows an empty title
          // where the final value will be "no title".
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
      // History shows the title: leaving it stale would show the old name until the next
      // pull-to-refresh.
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/**
 * Deletion (#26). No optimism here, unlike renaming: the action is irreversible and
 * cascades to the track. Removing the row before the server confirms, then bringing it
 * back on failure, would be genuinely alarming.
 */
export function useDeleteActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteActivity(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: ['activity', id] });
      queryClient.removeQueries({ queryKey: ['track-points', id] });
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      // Stats aggregate activities: a deleted session must drop out of them (DoD #26).
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
