/**
 * Background location task (#16).
 *
 * ⚠️ This module runs in a SEPARATE JS CONTEXT. On iOS, the system wakes the app up
 * "headless": neither React, nor the Zustand store, nor the session engine exist then.
 * The task can therefore only write to the SQLite buffer, which is precisely why the
 * buffer was laid down in Epic 3, independent from the store.
 *
 * Known limitation (#70): nothing reconciles these points with the live display when the
 * app returns to the foreground, and the foreground watch keeps writing to the same
 * buffer. Two writers can therefore compete for the same sequence numbers.
 *
 * The task definition must be evaluated BEFORE the system wakes it up, hence at module
 * load time, not in a component. That's why this file is imported from
 * `core/gps/index.ts`, itself imported by the session engine.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { appendPoint, loadSession, nextSeqAfterBuffer } from '../session/buffer';
import type { GpsFix } from './index';

export const BACKGROUND_LOCATION_TASK = 'stracks-background-location';

interface LocationTaskData {
  locations: Location.LocationObject[];
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error != null) {
    return; // nothing to do: the system will retry on the next fix
  }
  const locations = (data as LocationTaskData | undefined)?.locations ?? [];
  if (locations.length === 0) {
    return;
  }

  // No session in progress: the task outlived a badly finished stop. Orphan points aren't
  // attached to a session that no longer exists.
  const session = await loadSession().catch(() => null);
  if (session == null) {
    return;
  }

  // Numbering restarts from the buffer, never from an in-memory counter: this context can
  // be created and destroyed several times during a single session.
  let seq = await nextSeqAfterBuffer();
  for (const location of locations) {
    const fix: GpsFix = {
      recordedAtMs: location.timestamp,
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      altitudeM: location.coords.altitude,
      accuracyM: location.coords.accuracy,
    };
    await appendPoint(seq, fix).catch(() => {});
    seq += 1;
  }
});
