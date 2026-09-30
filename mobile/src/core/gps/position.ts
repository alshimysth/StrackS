/**
 * One-off position, to declare a privacy zone "here" (#37). Same permission as session
 * tracking (foreground): nothing more is requested.
 *
 * A module separate from `core/gps/index.ts` on purpose: that one loads the background
 * task (#16), hence the SQLite buffer. A settings screen shouldn't pull in the session engine.
 */
import * as Location from 'expo-location';

export async function getCurrentPosition(): Promise<{ lat: number; lng: number; accuracyM: number | null }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permission de localisation refusée — active-la dans les réglages.');
  }
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracyM: location.coords.accuracy,
  };
}

/**
 * Foreground permission state, **without requesting it** (#82): onboarding steps aside for
 * whoever already granted it, an existing user updating the app, for instance.
 */
export async function hasForegroundPermission(): Promise<boolean> {
  const permission = await Location.getForegroundPermissionsAsync();
  return permission.granted;
}

/**
 * Requests the foreground permission from onboarding (#82), after the explanation. Never
 * "Always" here: outside a session, iOS flatly refuses it (see `core/gps`, #16).
 */
export async function requestForegroundPermission(): Promise<boolean> {
  const permission = await Location.requestForegroundPermissionsAsync();
  return permission.granted;
}

