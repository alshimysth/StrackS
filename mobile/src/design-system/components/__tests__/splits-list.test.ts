/**
 * Splits formatting (#22). Values come from the `metrics.splits` JSONB computed by
 * `RunningPlugin`, hence from an untyped source that must be filtered.
 */
import { barRatio, parseSplits } from '../SplitsList';

describe('parseSplits', () => {
  it('reads well-formed splits', () => {
    expect(
      parseSplits([
        { km: 1, paceSecPerKm: 300 },
        { km: 2, paceSecPerKm: 310 },
      ]),
    ).toEqual([
      { km: 1, paceSecPerKm: 300 },
      { km: 2, paceSecPerKm: 310 },
    ]);
  });

  /** `metrics` is JSONB: a walking session has no splits at all. */
  it('returns an empty list for a missing or non-array value', () => {
    expect(parseSplits(undefined)).toEqual([]);
    expect(parseSplits(null)).toEqual([]);
    expect(parseSplits({ km: 1 })).toEqual([]);
  });

  it('drops incomplete entries without discarding the good ones', () => {
    expect(
      parseSplits([{ km: 1, paceSecPerKm: 300 }, { km: 2 }, null, { paceSecPerKm: 320 }]),
    ).toEqual([{ km: 1, paceSecPerKm: 300 }]);
  });
});

describe('barRatio', () => {
  it('gives the full bar to the slowest km', () => {
    expect(barRatio(360, 360)).toBe(1);
  });

  it('scales the others to the slowest', () => {
    expect(barRatio(180, 360)).toBeCloseTo(0.5);
  });

  /** Without a floor, a very fast km would shrink to an invisible line. */
  it('applies a 15 % floor', () => {
    expect(barRatio(10, 600)).toBe(0.15);
  });

  it('does not divide by zero', () => {
    expect(barRatio(300, 0)).toBe(1);
  });
});
