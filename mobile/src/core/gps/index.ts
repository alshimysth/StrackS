/**
 * GPS engine, wrapping expo-location.
 *
 * Two complementary modes:
 *  - foreground (`startGpsWatch`): feeds the live display through the store;
 *  - background (`startBackgroundUpdates`, #16): writes straight to the SQLite buffer from
 *    a separate JS context, screen locked.
 *
 * Background mode requires an EAS dev build; it does NOT work in Expo Go (#15).
 */
import * as Location from 'expo-location';

import { BACKGROUND_LOCATION_TASK } from './background-task';
import { colors } from '../../design-system/theme';

/** Raw fix, as persisted in the buffer then sent to the server. */
export interface GpsFix {
  recordedAtMs: number;
  lat: number;
  lng: number;
  altitudeM: number | null;
  accuracyM: number | null;
}

export type GpsSubscription = { remove(): void };

export type GpsMode = 'max' | 'balanced' | 'saver';

/**
 * GPS settings per mode (#36). **`balanced` reproduces exactly the settings from before the
 * mode choice existed**, the ones filtering (#17) and client/server parity (#40) were
 * established with. A user who touches nothing therefore sees no change.
 *
 * The battery impact of `max` and `saver` is **not measured**: it depends on the field
 * test (#18). The screen's labels stay tentative until then.
 *
 * ⚠️ `timeInterval` is only honoured on **Android**: iOS only follows `distanceInterval`.
 * On iPhone, `saver` therefore differs by its accuracy and its 5 m, not by its 3 s.
 */
export const GPS_MODE_SETTINGS: Record<
  GpsMode,
  { accuracy: Location.Accuracy; timeInterval: number; distanceInterval: number }
> = {
  // Every fix, with no movement threshold: the most faithful in turns, the most costly.
  max: { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
  balanced: { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
  // One fix every 3 s or 5 m, "high" accuracy rather than "navigation": stays under the
  // signal loss threshold (15 s, #19), so the distance is always counted.
  saver: { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
};

/**
 * Requests the foreground permission then starts the watch in the given mode (#36).
 * Rejects with a user-facing message if the permission is denied.
 */
export async function startGpsWatch(
  onFix: (fix: GpsFix) => void,
  mode: GpsMode = 'balanced',
): Promise<GpsSubscription> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permission de localisation refusée — active-la dans les réglages.');
  }
  return Location.watchPositionAsync(
    { ...GPS_MODE_SETTINGS[mode] },
    (location) => {
      onFix({
        recordedAtMs: location.timestamp,
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        altitudeM: location.coords.altitude,
        accuracyM: location.coords.accuracy,
      });
    },
  );
}

/**
 * Starts background tracking (#16).
 *
 * @returns true if background mode is active; false if the "always" permission was
 * denied. The caller then stays in the foreground, which is an acceptable degradation
 * (the session goes on while the screen is on), not a failure.
 *
 * The "always" permission is requested AFTER the session starts, never at app launch: iOS
 * flatly refuses an out-of-context request, and a user who just started a run understands
 * why it's asked at that moment.
 */
export async function startBackgroundUpdates(mode: GpsMode = 'balanced'): Promise<boolean> {
  const permission = await Location.requestBackgroundPermissionsAsync();
  if (!permission.granted) {
    return false;
  }
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
    return true; // already running: don't stack two subscriptions
  }
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    ...GPS_MODE_SETTINGS[mode],
    // Android requires a persistent notification: without it the system kills the task
    // after a few minutes.
    foregroundService: {
      notificationTitle: 'Séance en cours',
      notificationBody: 'StrackS enregistre ton parcours.',
      notificationColor: colors.primary500, // couleur de marque, plus le bleu du gabarit Expo
    },
    pausesUpdatesAutomatically: false, // iOS would cut it off on its own when stopped: that's our job
    showsBackgroundLocationIndicator: true,
  });
  return true;
}

/** Stops background tracking. No error if the task isn't running. */
export async function stopBackgroundUpdates(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
  }
}
