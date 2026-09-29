/**
 * Position ponctuelle, pour déclarer une zone de confidentialité « ici » (#37). Même
 * permission que le suivi de séance (premier plan) : rien de plus n'est demandé.
 *
 * Module séparé de `core/gps/index.ts` à dessein : celui-ci charge la tâche d'arrière-plan
 * (#16), donc le buffer SQLite. Un écran de réglages n'a pas à tirer le moteur de séance.
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
