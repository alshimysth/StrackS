/**
 * Client-side GPS computations: a lighter mirror of GpsComputations.java (backend), same
 * thresholds: 50 m accuracy, 2 m elevation hysteresis, 5-point smoothing window.
 * ONLY serves the live display; the server recomputes everything at stop from the raw
 * track (source of truth), splits included.
 *
 * **Altitude smoothing isn't the same on both sides** (#53): TRAILING average over the
 * last 5 points here (a real-time accumulator can't see the future), CENTRED average on
 * the server. The parity fixtures are chosen so both agree; on a real noisy track, the
 * elevation gain shown during the session may therefore differ from the summary's. The
 * gap isn't quantified yet: it's measured with `scripts/measure-elevation-drift.mts` on
 * the field test tracks (#17), and the decision (tolerate, show as provisional, or
 * delayed centred smoothing) depends on it.
 */
import type { GpsFix } from '../gps';
import type { SessionState } from './types';

export const MAX_ACCURACY_M = 50;
const ELEVATION_HYSTERESIS_M = 2;
const SMOOTHING_WINDOW = 5;
const SPEED_WINDOW_MS = 15_000;
/**
 * Beyond this gap between two accepted fixes, the signal is considered lost and the
 * segment is NOT counted (#19). Without this rule, going through a tunnel adds the chord
 * between entry and exit: the plausibility filter doesn't catch it (1 km in 5 min =
 * 12 km/h, plausible), and a straight-line distance gets counted although it was never
 * covered. The ticket explicitly decides: no interpolation by default.
 *
 * EXACT MIRROR of GpsComputations.SIGNAL_LOST_MS: any change here must be carried over to
 * the server, otherwise the live display diverges from the recomputation at stop
 * (parity #40).
 */
export const SIGNAL_LOST_MS = 15_000;
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
 * Incremental accumulator: each accepted fix updates distance, elevation (trailing
 * smoothing + hysteresis) and smoothed speed. Replayable from the buffer for recovery
 * after a kill.
 */
export class GpsAccumulator {
  distanceM = 0;
  elevationGainM = 0;
  elevationLossM = 0;
  smoothedSpeedMs = 0;
  /** Track of the accepted points, ready for the map's Polyline. */
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

  /** @returns true if the fix passes the filters (accuracy, plausibility). */
  add(fix: GpsFix): boolean {
    if (fix.accuracyM != null && fix.accuracyM > MAX_ACCURACY_M) {
      return false;
    }
    if (this.prev != null) {
      const gapMs = fix.recordedAtMs - this.prev.recordedAtMs;
      const seconds = gapMs / 1000;
      if (seconds <= 0) {
        return false;
      }
      const segmentM = haversineM(this.prev.lat, this.prev.lng, fix.lat, fix.lng);
      if (segmentM / seconds > this.maxSpeedMs) {
        return false;
      }
      // Gap too long: the point is accepted (it reopens the track) but the segment isn't
      // counted, since we don't know which path was taken in between.
      if (gapMs < SIGNAL_LOST_MS) {
        this.distanceM += segmentM;
      }
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
