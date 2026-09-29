/**
 * Client/server parity of the GPS engine (#40).
 *
 * `core/session/metrics.ts` (live display) and `GpsComputations.java` (source of truth,
 * recomputation at stop) must give the SAME metrics on the SAME tracks. Without this
 * safeguard, a silent drift between the two would distort everything shown during a
 * session without any test flinching: that's this file's reason to exist.
 *
 * Expected values come out of the real Java implementation (see
 * `support/gps-fixtures.ts`, JAVA_GOLDEN). A red test here means one of two things:
 *  - the backend changed and the client didn't follow (or the reverse);
 *  - the change was deliberate, and JAVA_GOLDEN must be regenerated from the backend,
 *    never adjusted by hand to make the test pass.
 *
 * ACCEPTED STRUCTURAL DIFFERENCE: altitude smoothing. The server uses a CENTRED moving
 * average (it sees the whole track); the incremental client can only smooth over the
 * last 5 points (TRAILING average). The fixtures below are chosen so both schemes produce
 * the same sequence of deltas (flats, monotonic ramps, steps, lone spike): parity
 * therefore covers thresholds and formulas, not the window's alignment. See also #53.
 */
import { GpsAccumulator, MAX_ACCURACY_M, haversineM } from '../metrics';
import {
  JAVA_GOLDEN,
  cleanTrack,
  duplicateTimestampTrack,
  implausibleSpeedTrack,
  longTrack,
  noisyAltitudeTrack,
  poorAccuracyTrack,
  replay,
  steadyClimbTrack,
  steadyDescentTrack,
} from './support/gps-fixtures';

/** Millimetre tolerance: fine enough to spot any change of formula or Earth radius, loose
 *  enough for the last bits of Math.sin between the JVM and V8. */
const MM = 3;

describe('haversineM: same formula as GpsComputations.haversineM', () => {
  it('Paris → Lyon gives the Java golden distance', () => {
    expect(haversineM(48.8566, 2.3522, 45.764, 4.8357)).toBeCloseTo(
      JAVA_GOLDEN.haversineParisLyonM,
      MM,
    );
  });

  it('stays within the Java test bounds (380–400 km)', () => {
    const d = haversineM(48.8566, 2.3522, 45.764, 4.8357);
    expect(d).toBeGreaterThan(380_000);
    expect(d).toBeLessThan(400_000);
  });

  it('a 0.0001° latitude step is 11.119… m', () => {
    expect(haversineM(45.0, 5.0, 45.0001, 5.0)).toBeCloseTo(JAVA_GOLDEN.haversineOneStepM, MM);
  });

  it('is symmetric and zero in place', () => {
    expect(haversineM(45.0, 5.0, 45.0, 5.0)).toBe(0);
    expect(haversineM(45.0, 5.0, 45.01, 5.01)).toBeCloseTo(
      haversineM(45.01, 5.01, 45.0, 5.0),
      MM,
    );
  });
});

describe('distance: accumulation on a clean track', () => {
  it('100 points ≈ 1.1 km, matching the Java golden value', () => {
    const { acc, acceptedCount } = replay(GpsAccumulator, cleanTrack);
    expect(acceptedCount).toBe(100);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.cleanTrackDistanceM, MM);
  });

  it('stays within the Java test bounds (1050–1150 m)', () => {
    const { acc } = replay(GpsAccumulator, cleanTrack);
    expect(acc.distanceM).toBeGreaterThan(1050);
    expect(acc.distanceM).toBeLessThan(1150);
  });

  it('200 points ≈ 2.2 km (server splits dataset)', () => {
    const { acc } = replay(GpsAccumulator, longTrack);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.longTrackDistanceM, MM);
  });

  it('publishes the track of accepted points for the map', () => {
    const { acc } = replay(GpsAccumulator, cleanTrack);
    expect(acc.path).toHaveLength(100);
    expect(acc.path[0]).toEqual({ latitude: 45.0, longitude: 5.0 });
    expect(acc.lastAcceptedMs).toBe(cleanTrack[99].recordedAtMs);
  });
});

describe('filters: same points dropped as the server', () => {
  it('drops the inaccurate point and measures the distance across', () => {
    const { acc, accepted } = replay(GpsAccumulator, poorAccuracyTrack);
    expect(accepted).toEqual([true, false, true]);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.poorAccuracyDistanceM, MM);
    // Java test bound: the 500 m jump must not enter the total.
    expect(acc.distanceM).toBeLessThan(50);
  });

  it('drops the 600 km/h segment', () => {
    const { acc, accepted } = replay(GpsAccumulator, implausibleSpeedTrack);
    expect(accepted).toEqual([true, false, true]);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.implausibleSpeedDistanceM, MM);
    expect(acc.distanceM).toBeLessThan(50);
  });

  it('drops a point not later than the previous one (seconds <= 0)', () => {
    const { acc, accepted } = replay(GpsAccumulator, duplicateTimestampTrack);
    expect(accepted).toEqual([true, false, true]);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.duplicateTimestampDistanceM, MM);
  });

  it('accepts a point without known accuracy (accuracyM null)', () => {
    const acc = new GpsAccumulator(25);
    expect(acc.add({ recordedAtMs: 0, lat: 45, lng: 5, altitudeM: null, accuracyM: null })).toBe(
      true,
    );
  });
});

describe('elevation: hysteresis and smoothing aligned with the server', () => {
  it('ignores GPS noise (±0.8 m oscillation)', () => {
    const { acc } = replay(GpsAccumulator, noisyAltitudeTrack);
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.noisyAltitudeGainM, 6);
    expect(acc.elevationLossM).toBeCloseTo(0, 6);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.noisyAltitudeDistanceM, MM);
  });

  it('counts a real 30 m climb like the server', () => {
    const { acc } = replay(GpsAccumulator, steadyClimbTrack);
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.steadyClimbGainM, 6);
    expect(acc.elevationLossM).toBeCloseTo(JAVA_GOLDEN.steadyClimbLossM, 6);
    // Java test bounds: > 24 m and <= 30 m.
    expect(acc.elevationGainM).toBeGreaterThan(24);
    expect(acc.elevationGainM).toBeLessThanOrEqual(30);
  });

  it('counts a real 30 m descent like the server', () => {
    const { acc } = replay(GpsAccumulator, steadyDescentTrack);
    expect(acc.elevationLossM).toBeCloseTo(JAVA_GOLDEN.steadyDescentLossM, 6);
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.steadyDescentGainM, 6);
  });
});

describe('shared constants', () => {
  it('MAX_ACCURACY_M is 50 m, like GpsComputations.MAX_ACCURACY_M', () => {
    expect(MAX_ACCURACY_M).toBe(50);
  });
});
