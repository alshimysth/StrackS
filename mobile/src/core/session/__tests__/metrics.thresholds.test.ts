/**
 * Threshold probes of the client GPS engine (#40).
 *
 * `metrics.ts` keeps three private constants no type protects: 50 m max accuracy, 2 m
 * elevation hysteresis, 5-point smoothing. Each test below is built to FLIP if one of
 * these values moves: a threshold changed by a hair brings down a test named after it,
 * rather than silently distorting a session's display.
 *
 * Expected values are those of the Java implementation (JAVA_GOLDEN): the probes are
 * chosen to give the same result under the server's centred smoothing and the client's
 * trailing smoothing.
 */
import { GpsAccumulator } from '../metrics';
import {
  DEG_PER_M,
  JAVA_GOLDEN,
  MAX_SPEED_KMH,
  altitudeStepTrack,
  fix,
  loneSpikeTrack,
  replay,
  twoPointSegment,
} from './support/gps-fixtures';

describe('accuracy threshold: 50 m', () => {
  it('accepts a point with exactly 50 m accuracy', () => {
    const acc = new GpsAccumulator(MAX_SPEED_KMH);
    expect(acc.add(fix(0, 45.0, { accuracyM: 50 }))).toBe(true);
  });

  it('drops a point just beyond 50 m', () => {
    const acc = new GpsAccumulator(MAX_SPEED_KMH);
    expect(acc.add(fix(0, 45.0, { accuracyM: 50.000001 }))).toBe(false);
  });

  it('drops any poor point without breaking the track measurement', () => {
    // 20 m in 6 s: plausible. Only accuracy decides here.
    const track = [fix(0, 45.0), fix(1, 45.00018, { accuracyM: 51 }), fix(2, 45.00036)];
    const { accepted } = replay(GpsAccumulator, track);
    expect(accepted).toEqual([true, false, true]);
  });
});

describe('elevation hysteresis: 2 m', () => {
  it("accumulates nothing for a 1.9 m step", () => {
    const { acc } = replay(GpsAccumulator, altitudeStepTrack(1.9));
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.altitudeStep19GainM, 6);
    expect(acc.elevationGainM).toBe(0);
  });

  it('accumulates a 2.0 m step, right at the threshold', () => {
    const { acc } = replay(GpsAccumulator, altitudeStepTrack(2));
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.altitudeStep20GainM, 6);
  });

  it('counts a negative 2.0 m step as descent', () => {
    const { acc } = replay(GpsAccumulator, altitudeStepTrack(-2));
    expect(acc.elevationLossM).toBeCloseTo(JAVA_GOLDEN.altitudeStep20GainM, 6);
    expect(acc.elevationGainM).toBe(0);
  });

  it('ignores a back-and-forth under the threshold, whatever the number of cycles', () => {
    const track = Array.from({ length: 120 }, (_, i) =>
      fix(i, 45.0 + i * 0.0001, { altitudeM: 200 + (i % 2 === 0 ? 0.9 : -0.9) }),
    );
    const { acc } = replay(GpsAccumulator, track);
    expect(acc.elevationGainM).toBe(0);
    expect(acc.elevationLossM).toBe(0);
  });
});

describe('smoothing window: 5 points', () => {
  it('reduces a lone 11 m spike to 11/5 = 2.2 m', () => {
    // Fingerprint of the window width: 5 points → 2.2 m (above the hysteresis, so
    // counted); 4 points → 2.75 m; 6 points → 1.83 m, under the threshold, so zero gain.
    // The three cases can be told apart.
    const { acc } = replay(GpsAccumulator, loneSpikeTrack(11));
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.loneSpike11GainM, 6);
    expect(acc.elevationLossM).toBeCloseTo(JAVA_GOLDEN.loneSpike11LossM, 6);
  });

  it('fully absorbs a lone 9 m spike (9/5 = 1.8 < 2)', () => {
    const { acc } = replay(GpsAccumulator, loneSpikeTrack(9));
    expect(acc.elevationGainM).toBe(0);
    expect(acc.elevationLossM).toBe(0);
  });

  it('only takes points carrying an altitude into account', () => {
    // Missing altitude: the point counts for distance, not for smoothing.
    const track = [
      ...Array.from({ length: 10 }, (_, i) => fix(i, 45.0 + i * 0.0001)),
      ...Array.from({ length: 10 }, (_, i) => fix(10 + i, 45.001 + i * 0.0001, { altitudeM: null })),
    ];
    const { acc, acceptedCount } = replay(GpsAccumulator, track);
    expect(acceptedCount).toBe(20);
    expect(acc.elevationGainM).toBe(0);
  });
});

describe('speed plausibility: km/h → m/s conversion', () => {
  it('accepts a segment just under the max speed', () => {
    const maxSpeedMs = MAX_SPEED_KMH / 3.6;
    const { accepted } = replay(GpsAccumulator, twoPointSegment(2, maxSpeedMs * 0.999));
    expect(accepted).toEqual([true, true]);
  });

  it('drops a segment just above the max speed', () => {
    const maxSpeedMs = MAX_SPEED_KMH / 3.6;
    const { accepted } = replay(GpsAccumulator, twoPointSegment(2, maxSpeedMs * 1.001));
    expect(accepted).toEqual([true, false]);
  });

  it('reads maxSpeedKmh in km/h and not in m/s', () => {
    // 36 km/h = exactly 10 m/s: the probe fails if the /3.6 disappears or changes.
    expect(replay(GpsAccumulator, twoPointSegment(2, 9.9), 36).accepted).toEqual([true, true]);
    expect(replay(GpsAccumulator, twoPointSegment(2, 10.1), 36).accepted).toEqual([true, false]);
  });

  it('applies the cap of each sport (walking stricter than running)', () => {
    // 4 m/s = 14.4 km/h: plausible when running, not when walking.
    expect(replay(GpsAccumulator, twoPointSegment(2, 4), 25).accepted).toEqual([true, true]);
    expect(replay(GpsAccumulator, twoPointSegment(2, 4), 10).accepted).toEqual([true, false]);
  });
});

describe('smoothed speed: client specific (the server computes splits)', () => {
  it('stays zero while the window is shorter than 3 s', () => {
    const acc = new GpsAccumulator(MAX_SPEED_KMH);
    acc.add(fix(0, 45.0, { atMs: 0 }));
    expect(acc.smoothedSpeedMs).toBe(0);
    // Second point 2 s later: a 2 s window, under the threshold.
    acc.add(fix(1, 45.0002, { atMs: 2000 }));
    expect(acc.smoothedSpeedMs).toBe(0);
  });

  it('computes the speed as soon as the window exceeds 3 s', () => {
    const acc = new GpsAccumulator(MAX_SPEED_KMH);
    acc.add(fix(0, 45.0, { atMs: 0 }));
    acc.add(fix(1, 45.0 + 20 * DEG_PER_M, { atMs: 4000 })); // 20 m in 4 s = 5 m/s
    expect(acc.smoothedSpeedMs).toBeCloseTo(5, 3);
  });

  it('only smooths over the last 15 seconds', () => {
    const acc = new GpsAccumulator(MAX_SPEED_KMH);
    // 30 points 1 s apart: 2 m/s for 15 s, then 6 m/s.
    for (let i = 0; i < 15; i++) {
      acc.add(fix(i, 45.0 + i * 2 * DEG_PER_M, { atMs: i * 1000 }));
    }
    expect(acc.smoothedSpeedMs).toBeCloseTo(2, 2);

    const lastSlowLat = 45.0 + 14 * 2 * DEG_PER_M;
    for (let i = 0; i < 15; i++) {
      acc.add(fix(15 + i, lastSlowLat + (i + 1) * 6 * DEG_PER_M, { atMs: (15 + i) * 1000 }));
    }
    // The slow portion left the window: only the fast one counts.
    expect(acc.smoothedSpeedMs).toBeCloseTo(6, 2);
  });

  it('publishes a full snapshot for the UI', () => {
    const { acc } = replay(GpsAccumulator, altitudeStepTrack(2));
    expect(acc.snapshot(123)).toEqual({
      elapsedS: 123,
      distanceM: acc.distanceM,
      elevationGainM: acc.elevationGainM,
      elevationLossM: acc.elevationLossM,
      smoothedSpeedMs: acc.smoothedSpeedMs,
    });
  });
});
