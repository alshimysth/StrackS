/**
 * Track upload queue (Epic 3). Sends the buffer's points in batches to the idempotent
 * endpoint (replay without duplicates on the server). Tolerant to network loss: a failure
 * leaves the points pending, the next flush retries.
 */
import { markUploaded, pendingPoints } from './buffer';
import { ApiError } from '../api/client';
import { uploadTrackPoints } from '../api/activities';

const BATCH_SIZE = 100;

let flushing = false;

/**
 * Pushes every pending point. @returns true if the buffer is emptied, false if the network
 * gave out (retry later). API errors (404 deleted activity, 401…) bubble up to the caller.
 */
export async function flushTrackPoints(activityId: string): Promise<boolean> {
  if (flushing) {
    return false;
  }
  flushing = true;
  try {
    for (;;) {
      const batch = await pendingPoints(BATCH_SIZE);
      if (batch.length === 0) {
        return true;
      }
      await uploadTrackPoints(
        activityId,
        batch.map((p) => ({
          seq: p.seq,
          recordedAt: new Date(p.recordedAtMs).toISOString(),
          lat: p.lat,
          lng: p.lng,
          altitudeM: p.altitudeM,
          accuracyM: p.accuracyM,
        })),
      );
      await markUploaded(batch.map((p) => p.seq));
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    return false; // network failure: the points stay pending
  } finally {
    flushing = false;
  }
}
