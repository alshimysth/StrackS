/**
 * GPS datasets shared with the backend: the SAME tracks as
 * `backend/src/test/java/com/stracks/core/activity/GpsComputationsTest.java`.
 *
 * `metrics.ts` is the client mirror of `GpsComputations.java`: these fixtures exist so
 * that a threshold or formula divergence between the two implementations makes a test
 * fail on the mobile side (#40).
 *
 * The expected values (`JAVA_GOLDEN`) aren't copied by hand: they come out of the real
 * Java implementation, run on these same tracks. To regenerate them after a deliberate
 * backend change:
 *
 *   cd backend && ./mvnw -q compile
 *   jshell --class-path "target/classes:target/quarkus-app/lib/main/*"
 *   # then instantiate TrackPointEntity objects with the tracks below and
 *   # call GpsComputations.compute(track, 25.0)
 */
import type { GpsFix } from '../../../gps';

/** Fixed base timestamp: tracks must be reproducible. */
export const T0_MS = Date.parse('2026-08-11T08:00:00Z');

/** Maximum plausibility speed used by the Java test (running). */
export const MAX_SPEED_KMH = 25;

/**
 * Along a meridian the haversine is linear: 0.0001° of latitude is 11.119492664825003 m
 * (value measured on the Java implementation). Used to place a point at a wanted distance
 * to the metre.
 */
export const M_PER_1E4_DEG = 11.119492664825003;
export const DEG_PER_M = 0.0001 / M_PER_1E4_DEG;

export function fix(
  index: number,
  lat: number,
  options: { lng?: number; altitudeM?: number | null; accuracyM?: number | null; atMs?: number } = {},
): GpsFix {
  return {
    recordedAtMs: options.atMs ?? T0_MS + index * 6000,
    lat,
    lng: options.lng ?? 5.0,
    altitudeM: options.altitudeM === undefined ? 200 : options.altitudeM,
    accuracyM: options.accuracyM === undefined ? 5 : options.accuracyM,
  };
}

/** Clean 100-point track, ~11.1 m per step → ~1.1 km. */
export const cleanTrack: GpsFix[] = Array.from({ length: 100 }, (_, i) =>
  fix(i, 45.0 + i * 0.0001),
);

/** 200-point track (~2.2 km): the server-side splits dataset. */
export const longTrack: GpsFix[] = Array.from({ length: 200 }, (_, i) =>
  fix(i, 45.0 + i * 0.0001),
);

/** Outlier in the middle: a 500 m jump with 120 m accuracy. */
export const poorAccuracyTrack: GpsFix[] = [
  fix(0, 45.0),
  fix(1, 45.005, { accuracyM: 120 }),
  fix(2, 45.0002),
];

/** A 1 km jump in 6 s = 600 km/h: impossible on foot. */
export const implausibleSpeedTrack: GpsFix[] = [fix(0, 45.0), fix(1, 45.009), fix(2, 45.0001)];

/** ±0.8 m oscillation around 200 m: pure noise, expected gain zero. */
export const noisyAltitudeTrack: GpsFix[] = Array.from({ length: 60 }, (_, i) =>
  fix(i, 45.0 + i * 0.0001, { altitudeM: 200 + (i % 2 === 0 ? 0.8 : -0.8) }),
);

/** Steady 30 m climb over 60 points. */
export const steadyClimbTrack: GpsFix[] = Array.from({ length: 60 }, (_, i) =>
  fix(i, 45.0 + i * 0.0001, { altitudeM: 200 + i * 0.5 }),
);

/** Steady 30 m descent over 60 points. */
export const steadyDescentTrack: GpsFix[] = Array.from({ length: 60 }, (_, i) =>
  fix(i, 45.0 + i * 0.0001, { altitudeM: 200 - i * 0.5 }),
);

/** Two points with the same timestamp: the segment must be dropped. */
export const duplicateTimestampTrack: GpsFix[] = [
  fix(0, 45.0),
  fix(1, 45.0001, { atMs: T0_MS }),
  fix(2, 45.0002),
];

/**
 * Altitude step of `stepM` after 20 flat points, then 20 points at the new level. 5-point
 * smoothing spreads the step: the maximum delta seen by the hysteresis is exactly
 * `stepM`, which makes it a clean probe of the 2 m threshold, for BOTH smoothing schemes
 * (trailing on the client, centred on the server: same sequence of deltas).
 */
export function altitudeStepTrack(stepM: number): GpsFix[] {
  return Array.from({ length: 40 }, (_, i) =>
    fix(i, 45.0 + i * 0.0001, { altitudeM: 200 + (i < 20 ? 0 : stepM) }),
  );
}

/**
 * Single-point altitude spike. 5-point smoothing reduces it to `spikeM / 5`: the
 * resulting gain is a direct fingerprint of the window width (11 m → 2.2 m with 5 points,
 * 2.75 m with 4, nothing with 6).
 */
export function loneSpikeTrack(spikeM: number): GpsFix[] {
  return Array.from({ length: 40 }, (_, i) =>
    fix(i, 45.0 + i * 0.0001, { altitudeM: 200 + (i === 20 ? spikeM : 0) }),
  );
}

/**
 * Two points `seconds` apart, separated by the length `speedMs` implies. Probe of the
 * plausibility filter.
 */
export function twoPointSegment(seconds: number, speedMs: number): GpsFix[] {
  const distanceM = speedMs * seconds;
  return [
    fix(0, 45.0),
    fix(1, 45.0 + distanceM * DEG_PER_M, { atMs: T0_MS + seconds * 1000 }),
  ];
}

/**
 * Results of `GpsComputations.compute(track, 25.0)`, the real Java implementation
 * (backend @ 7cde637), captured through jshell on `target/classes`. Any change to these
 * numbers must come from a deliberate change of the backend engine, never from an
 * adjustment to "make the test pass".
 */
export const JAVA_GOLDEN = {
  haversineParisLyonM: 391498.9316742573,
  haversineOneStepM: 11.119492664825003,
  cleanTrackDistanceM: 1100.8297737813316,
  longTrackDistanceM: 2212.779040226695,
  poorAccuracyDistanceM: 22.23898532885992,
  implausibleSpeedDistanceM: 11.119492664825003,
  duplicateTimestampDistanceM: 22.23898532885992,
  noisyAltitudeDistanceM: 656.050067202553,
  noisyAltitudeGainM: 0,
  steadyClimbGainM: 28,
  steadyClimbLossM: 0,
  steadyDescentGainM: 0,
  steadyDescentLossM: 28,
  /** 1.9 m step: under the 2 m hysteresis → nothing accumulated. */
  altitudeStep19GainM: 0,
  /** 2.0 m step: right at the threshold → accumulated. */
  altitudeStep20GainM: 2,
  /** Lone 11 m spike smoothed over 5 points → 2.2 m up then down. */
  loneSpike11GainM: 2.1999999999999886,
  loneSpike11LossM: 2.1999999999999886,
} as const;

/** Replays a track through the client accumulator and returns the resulting state. */
export function replay(
  Accumulator: typeof import('../../metrics').GpsAccumulator,
  track: GpsFix[],
  maxSpeedKmh: number = MAX_SPEED_KMH,
) {
  const acc = new Accumulator(maxSpeedKmh);
  const accepted: boolean[] = [];
  for (const point of track) {
    accepted.push(acc.add(point));
  }
  return {
    acc,
    accepted,
    acceptedCount: accepted.filter(Boolean).length,
    rejectedCount: accepted.filter((ok) => !ok).length,
  };
}
