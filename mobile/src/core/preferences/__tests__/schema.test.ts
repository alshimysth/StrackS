/**
 * Mobile preferences schema (#56): defaults, read tolerance, helpers. Bound parity with
 * the backend lives in `schema.parity.test.ts`.
 */
import {
  DEFAULT_PREFERENCES,
  hasWeight,
  isPlausibleBirthDate,
  preferencesSchema,
  speedDisplayFor,
  type Preferences,
} from '../schema';

describe('preferencesSchema', () => {
  it('produces every default from an empty document', () => {
    expect(preferencesSchema.parse({})).toEqual({
      units: 'metric',
      theme: 'auto',
      defaultSport: null,
      sportDisplay: {},
      gpsMode: 'balanced',
      countdownEnabled: true,
      autoPauseEnabled: false,
      weeklyGoal: { distanceM: null, sessions: null },
      privacyZones: [],
      physical: { weightKg: null, heightCm: null, birthDate: null, sex: null },
    });
  });

  /** Contract with a more recent backend: an unknown key survives parsing. */
  it('keeps an unknown key rather than dropping it', () => {
    const parsed = preferencesSchema.parse({ units: 'imperial', heartRateZones: [120, 140] });
    expect(parsed).toMatchObject({ units: 'imperial', heartRateZones: [120, 140] });
  });

  it('completes a partial document with the defaults', () => {
    const parsed = preferencesSchema.parse({ weeklyGoal: { sessions: 3 } });
    expect(parsed.weeklyGoal).toEqual({ distanceM: null, sessions: 3 });
    expect(parsed.theme).toBe('auto');
  });

  it('rejects a value outside the list', () => {
    expect(preferencesSchema.safeParse({ theme: 'sepia' }).success).toBe(false);
  });
});

describe('isPlausibleBirthDate', () => {
  const today = new Date(2026, 8, 25); // September 25th, 2026, local time

  it.each([
    ['2016-09-25', true], // 10 years old today
    ['2016-09-26', false], // 10 years old only tomorrow
    ['1906-09-25', true], // 120 years old today
    ['1905-09-24', false], // 121 years old
    ['1990-06-15', true],
  ])('%s → %s', (iso, expected) => {
    expect(isPlausibleBirthDate(iso, today)).toBe(expected);
  });

  it.each(['2026-02-30', '15/06/1990', '1990-6-15', ''])('rejects the unreadable date "%s"', (iso) => {
    expect(isPlausibleBirthDate(iso, today)).toBe(false);
  });
});

describe('helpers', () => {
  const withPrefs = (patch: Partial<Preferences>): Preferences => ({
    ...DEFAULT_PREFERENCES,
    ...patch,
  });

  it('speedDisplayFor falls back to pace when nothing is set', () => {
    expect(speedDisplayFor(DEFAULT_PREFERENCES, 'walking')).toBe('pace');
  });

  it('speedDisplayFor reads the setting of the sport, not of another one', () => {
    const prefs = withPrefs({ sportDisplay: { walking: 'speed' } });
    expect(speedDisplayFor(prefs, 'walking')).toBe('speed');
    expect(speedDisplayFor(prefs, 'running')).toBe('pace');
  });

  it('hasWeight is false on an empty profile, true once the weight is set', () => {
    expect(hasWeight(DEFAULT_PREFERENCES)).toBe(false);
    const physical = { ...DEFAULT_PREFERENCES.physical, weightKg: 72 };
    expect(hasWeight(withPrefs({ physical }))).toBe(true);
  });
});
