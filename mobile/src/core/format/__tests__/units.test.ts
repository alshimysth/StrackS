/**
 * Centralized formatting (#30, #4).
 *
 * What these tests protect: the DoD "stored data stays in SI units, only the display
 * changes". Every input below is therefore in metres, seconds and m/s, never in km or
 * miles.
 */
import {
  formatAverage,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPaceValue,
  formatSpeed,
  speedUnit,
  formatLongDuration,
  fromDisplayWeight,
  toDisplayWeight,
  weightUnit,
} from '../units';

describe('formatDistance', () => {
  it('converts metres to km', () => {
    expect(formatDistance(4213, 'metric')).toBe('4,21');
  });

  it('converts the same metres to miles', () => {
    expect(formatDistance(1609.344, 'imperial')).toBe('1,00');
  });

  /** The mockups' convention, imperial included. */
  it('uses the decimal comma', () => {
    expect(formatDistance(5000, 'metric')).toContain(',');
    expect(formatDistance(5000, 'imperial')).toContain(',');
  });
});

describe('formatElevation', () => {
  it('returns metres as an integer', () => {
    expect(formatElevation(123.7, 'metric')).toBe('124');
  });

  it('converts to feet', () => {
    expect(formatElevation(100, 'imperial')).toBe('328');
  });
});

describe('formatSpeed', () => {
  /** 3.03 m/s ≈ 5'30"/km, a runner's reference pace. */
  it('returns a metric pace', () => {
    expect(formatSpeed(1000 / 330, 'metric', 'pace')).toBe("5'30\"");
  });

  it('returns a metric speed', () => {
    expect(formatSpeed(1.5, 'metric', 'speed')).toBe('5,4');
  });

  it('returns an imperial speed', () => {
    expect(formatSpeed(1.609344, 'imperial', 'speed')).toBe('3,6');
  });

  /**
   * `pace` and `speed` aren't two dressings of the same number but two inverses: that's
   * the reason for the per-sport setting.
   */
  it('produces two different values for pace and speed', () => {
    const ms = 3;
    expect(formatSpeed(ms, 'metric', 'pace')).not.toBe(formatSpeed(ms, 'metric', 'speed'));
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'returns a dash for an unusable speed (%p)',
    (value) => {
      expect(formatSpeed(value, 'metric', 'pace')).toBe('—');
      expect(formatSpeed(value, 'metric', 'speed')).toBe('—');
    },
  );
});

describe('formatPaceValue', () => {
  it('keeps the leading zero of the seconds', () => {
    expect(formatPaceValue(305)).toBe("5'05\"");
  });

  /**
   * Regression caught in review: rounding the REMAINDER instead of the total produced
   * "4'60\"" (299.6 % 60 = 59.6, which rounds to 60). A pace never has 60 seconds.
   */
  it('never produces 60 seconds', () => {
    expect(formatPaceValue(299.6)).toBe("5'00\"");
    expect(formatPaceValue(359.7)).toBe("6'00\"");
  });
});

describe('formatAverage', () => {
  it('computes the average pace from raw distance and duration', () => {
    expect(formatAverage(1000, 330, 'metric', 'pace')).toBe("5'30\"");
  });

  it('returns a dash for a session without distance', () => {
    expect(formatAverage(0, 600, 'metric', 'pace')).toBe('—');
    expect(formatAverage(1000, 0, 'metric', 'speed')).toBe('—');
  });
});

describe('speedUnit', () => {
  it('names the unit according to the system AND the mode', () => {
    expect(speedUnit('metric', 'pace')).toBe('/km');
    expect(speedUnit('imperial', 'pace')).toBe('/mi');
    expect(speedUnit('metric', 'speed')).toBe('km/h');
    expect(speedUnit('imperial', 'speed')).toBe('mph');
  });
});

describe('formatDuration', () => {
  it.each([
    [3724, '1:02:04'],
    [754, '12:34'],
    [0, '0:00'],
  ])('formats %i seconds as %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  /** Duration depends on no unit system: an hour stays an hour. */
  it('does not depend on units', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
  });

  /** Same regression as pace: "0:60" and "59:60" were produced. */
  it('never produces 60 seconds', () => {
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(3599.6)).toBe('1:00:00');
    expect(formatDuration(119.7)).toBe('2:00');
  });
});

describe('formatLongDuration (#7)', () => {
  it.each([
    [0, '0 min'],
    [59, '1 min'],
    [3600, '1 h 00 min'],
    [45 * 3600 + 12 * 60 + 29, '45 h 12 min'],
  ])('%s s → %s', (seconds, expected) => {
    expect(formatLongDuration(seconds)).toBe(expected);
  });
});

describe('weight (#32)', () => {
  it('stays in kg in metric', () => {
    expect(weightUnit('metric')).toBe('kg');
    expect(toDisplayWeight(72.35, 'metric')).toBe(72.4);
    expect(fromDisplayWeight(72.35, 'metric')).toBe(72.4);
  });

  it('enters and displays pounds, stores kg', () => {
    expect(weightUnit('imperial')).toBe('lb');
    expect(toDisplayWeight(72, 'imperial')).toBe(158.7);
    expect(fromDisplayWeight(158.7, 'imperial')).toBe(72);
  });

  /** Switching metric ↔ imperial must not make the stored weight drift. */
  it('round-trips without drift', () => {
    for (const kg of [30, 55.5, 72, 99.9, 300]) {
      expect(fromDisplayWeight(toDisplayWeight(kg, 'imperial'), 'imperial')).toBeCloseTo(kg, 1);
    }
  });
});

