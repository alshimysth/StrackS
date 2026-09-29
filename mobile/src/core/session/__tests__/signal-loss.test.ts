/**
 * GPS signal loss (#19): how distance behaves during and after the gap.
 *
 * DoD: "going through a tunnel produces neither a distance jump nor an absurd pace". The
 * trap these tests lock: the plausibility filter **isn't enough**. One kilometre covered
 * in five minutes of tunnel gives 12 km/h, perfectly plausible for a runner: the segment
 * passes the filter and adds a chord that was never travelled.
 */
import { GpsAccumulator, SIGNAL_LOST_MS } from '../metrics';
import type { GpsFix } from '../../gps';

const T0 = Date.parse('2026-08-21T08:00:00.000Z');

function fix(atMs: number, lat: number, lng = 5.0): GpsFix {
  return { recordedAtMs: atMs, lat, lng, altitudeM: 200, accuracyM: 5 };
}

/**
 * ~55 m per 0.0005° of latitude. A deliberately short step: covered in 14 s it gives
 * 14 km/h, under the running plausibility threshold (25 km/h). A longer step would make
 * the filter reject the point and would test something other than intended.
 */
const STEP_DEG = 0.0005;

describe('signal gap and distance', () => {
  it('counts a segment under the threshold normally', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    acc.add(fix(T0 + SIGNAL_LOST_MS - 1000, 45.0 + STEP_DEG));

    expect(acc.distanceM).toBeGreaterThan(50);
  });

  /**
   * The heart of the ticket: beyond the threshold, the segment is NOT counted. We don't
   * know which path was taken; the ticket decides "no interpolation by default".
   */
  it('does not count the segment spanning the gap', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    acc.add(fix(T0 + SIGNAL_LOST_MS + 1000, 45.0 + STEP_DEG));

    expect(acc.distanceM).toBe(0);
  });

  /** The resume point reopens the track: it's accepted, it enters the path. */
  it('still accepts the resume point', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    const accepted = acc.add(fix(T0 + SIGNAL_LOST_MS + 1000, 45.0 + STEP_DEG));

    expect(accepted).toBe(true);
    expect(acc.path).toHaveLength(2);
  });

  /** After the resume, counting goes on normally: the gap doesn't poison what follows. */
  it('resumes counting after the gap', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    acc.add(fix(T0 + SIGNAL_LOST_MS + 1000, 45.0 + STEP_DEG));
    const afterGap = acc.distanceM;
    acc.add(fix(T0 + SIGNAL_LOST_MS + 15_000, 45.0 + 2 * STEP_DEG));

    expect(afterGap).toBe(0);
    expect(acc.distanceM).toBeGreaterThan(50);
  });

  /**
   * The ticket's real scenario, in numbers: 5 minutes of tunnel, ~1.1 km as the crow
   * flies. Apparent speed 13 km/h, under the 25 km/h plausibility threshold, so the
   * filter lets it through. Without the gap rule, this distance would be counted.
   */
  it('adds nothing for a plausible but untravelled tunnel crossing', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    acc.add(fix(T0 + 300_000, 45.01)); // 5 min later, ~1.1 km further north

    expect(acc.distanceM).toBe(0);
    expect(acc.snapshot(300).smoothedSpeedMs).toBe(0);
  });

  /** The threshold is a hard boundary: exactly at the limit, nothing is counted anymore. */
  it('excludes the segment exactly at the threshold', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    acc.add(fix(T0 + SIGNAL_LOST_MS, 45.0 + STEP_DEG));

    expect(acc.distanceM).toBe(0);
  });
});
