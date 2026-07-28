/**
 * Calculs GPS côté client — miroir allégé de GpsComputations.java (backend),
 * mêmes seuils : précision 50 m, hystérésis dénivelé 2 m, lissage 5 points.
 * Sert UNIQUEMENT l'affichage live ; le serveur recalcule tout au stop depuis
 * le tracé brut (source de vérité), splits compris.
 */
import type { GpsFix } from '../gps';
import type { SessionState } from './types';

export const MAX_ACCURACY_M = 50;
const ELEVATION_HYSTERESIS_M = 2;
const SMOOTHING_WINDOW = 5;
const SPEED_WINDOW_MS = 15_000;
const EARTH_RADIUS_M = 6_371_000;

export interface LatLng {
  latitude: number;
  longitude: number;
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Accumulateur incrémental : chaque fix accepté met à jour distance, dénivelé
 * (lissage glissant + hystérésis) et vitesse lissée. Rejouable depuis le
 * buffer pour la récupération après kill.
 */
export class GpsAccumulator {
  distanceM = 0;
  elevationGainM = 0;
  elevationLossM = 0;
  smoothedSpeedMs = 0;
  /** Tracé des points acceptés, prêt pour la Polyline de la carte. */
  readonly path: LatLng[] = [];
  lastAcceptedMs: number | null = null;

  private readonly maxSpeedMs: number;
  private prev: GpsFix | null = null;
  private altWindow: number[] = [];
  private elevationRef: number | null = null;
  private recent: { t: number; d: number }[] = [];

  constructor(maxSpeedKmh: number) {
    this.maxSpeedMs = maxSpeedKmh / 3.6;
  }

  /** @returns true si le fix passe les filtres (précision, plausibilité). */
  add(fix: GpsFix): boolean {
    if (fix.accuracyM != null && fix.accuracyM > MAX_ACCURACY_M) {
      return false;
    }
    if (this.prev != null) {
      const seconds = (fix.recordedAtMs - this.prev.recordedAtMs) / 1000;
      if (seconds <= 0) {
        return false;
      }
      const segmentM = haversineM(this.prev.lat, this.prev.lng, fix.lat, fix.lng);
      if (segmentM / seconds > this.maxSpeedMs) {
        return false;
      }
      this.distanceM += segmentM;
    }
    this.prev = fix;
    this.lastAcceptedMs = fix.recordedAtMs;
    this.path.push({ latitude: fix.lat, longitude: fix.lng });

    if (fix.altitudeM != null) {
      this.altWindow.push(fix.altitudeM);
      if (this.altWindow.length > SMOOTHING_WINDOW) {
        this.altWindow.shift();
      }
      const smoothed = this.altWindow.reduce((a, b) => a + b, 0) / this.altWindow.length;
      if (this.elevationRef == null) {
        this.elevationRef = smoothed;
      } else {
        const delta = smoothed - this.elevationRef;
        if (delta >= ELEVATION_HYSTERESIS_M) {
          this.elevationGainM += delta;
          this.elevationRef = smoothed;
        } else if (delta <= -ELEVATION_HYSTERESIS_M) {
          this.elevationLossM += -delta;
          this.elevationRef = smoothed;
        }
      }
    }

    this.recent.push({ t: fix.recordedAtMs, d: this.distanceM });
    while (this.recent.length > 1 && this.recent[0].t < fix.recordedAtMs - SPEED_WINDOW_MS) {
      this.recent.shift();
    }
    const first = this.recent[0];
    const spanS = (fix.recordedAtMs - first.t) / 1000;
    this.smoothedSpeedMs = spanS > 3 ? (this.distanceM - first.d) / spanS : 0;
    return true;
  }

  snapshot(elapsedS: number): SessionState {
    return {
      elapsedS,
      distanceM: this.distanceM,
      elevationGainM: this.elevationGainM,
      elevationLossM: this.elevationLossM,
      smoothedSpeedMs: this.smoothedSpeedMs,
    };
  }
}
