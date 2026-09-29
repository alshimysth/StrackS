/**
 * Parity of the zod mirror with `PreferencesService.java` (#56).
 *
 * A divergence between the two sides doesn't show at compile time: it shows in
 * production, as an incomprehensible 422 when the user saves a setting the front end
 * thought valid. Same risk as the one justifying the `metrics.ts` ↔
 * `GpsComputations.java` parity (#40).
 *
 * **Expected values are read from the Java source**, not copied here: changing a bound, a
 * value list or a key on the backend without carrying it over to `schema.ts` makes this
 * suite fail. Copied values would protect nothing: they would stay true while the backend
 * changes.
 *
 * `mobile-ci.yml` also triggers on this Java file; otherwise a backend-only change would
 * never run this test.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  BIRTH_AGE_BOUNDS,
  GPS_MODES,
  SEXES,
  SPEED_DISPLAYS,
  THEMES,
  UNITS,
  DEFAULT_PREFERENCES,
  physicalSchema,
  preferencesSchema,
  privacyZoneSchema,
  weeklyGoalSchema,
  MAX_PRIVACY_ZONES,
} from '../schema';

const JAVA_PATH = resolve(
  __dirname,
  '../../../../../backend/src/main/java/com/stracks/core/user/PreferencesService.java',
);
const java = readFileSync(JAVA_PATH, 'utf8');

/** `List.of("a", "b")` or `Set.of(...)` assigned to the `name` constant. */
function javaStrings(name: string): string[] {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:List|Set)\\.of\\(([^)]*)\\)`, 's').exec(java);
  if (match == null) {
    throw new Error(`Constante ${name} introuvable dans PreferencesService.java`);
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Bounds of the `positiveNumber(parent, "path", value, min, max)` calls. */
function javaBounds(): Map<string, { min: number; max: number }> {
  const bounds = new Map<string, { min: number; max: number }>();
  // Possibly negative bounds (latitude, longitude of privacy zones).
  const re = /positiveNumber\(\s*\w+,\s*"([^"]+)",[^;]*?,\s*(-?[\d_.]+),\s*(-?[\d_.]+)\s*\);/g;
  for (const m of java.matchAll(re)) {
    bounds.set(m[1], { min: Number(m[2].replace(/_/g, '')), max: Number(m[3].replace(/_/g, '')) });
  }
  return bounds;
}

const bounds = javaBounds();

describe('reading the Java source (safeguard of the test itself)', () => {
  it('finds every numeric bound', () => {
    // If the Java gets refactored, this test must break loudly rather than silently
    // compare nothing at all.
    expect([...bounds.keys()].sort()).toEqual([
      'physical.heightCm',
      'physical.weightKg',
      'privacyZones.lat',
      'privacyZones.lng',
      'privacyZones.radiusM',
      'weeklyGoal.distanceM',
      'weeklyGoal.sessions',
    ]);
  });
});

describe('allowed values', () => {
  it.each([
    ['UNITS', UNITS],
    ['THEMES', THEMES],
    ['GPS_MODES', GPS_MODES],
    ['SPEED_DISPLAYS', SPEED_DISPLAYS],
    ['SEXES', SEXES],
  ])('%s is identical on both sides', (name, values) => {
    expect([...values]).toEqual(javaStrings(name));
  });
});

describe('known keys', () => {
  /** `.passthrough()` removes nothing: we compare the declared shape, not an output. */
  it('root keys are those the backend accepts on write', () => {
    expect(Object.keys(preferencesSchema.shape).sort()).toEqual(javaStrings('ROOT_KEYS').sort());
  });

  it('athlete profile keys are the same', () => {
    expect(Object.keys(physicalSchema.shape).sort()).toEqual(javaStrings('PHYSICAL_KEYS').sort());
  });

  it('privacy zone keys are the same', () => {
    expect(Object.keys(privacyZoneSchema.shape).sort()).toEqual(javaStrings('PRIVACY_ZONE_KEYS').sort());
  });

  it('the maximum number of zones is the same', () => {
    const match = /MAX_PRIVACY_ZONES\s*=\s*(\d+)/.exec(java);
    expect(MAX_PRIVACY_ZONES).toBe(Number(match?.[1]));
  });

  it('weekly goal keys are the same', () => {
    expect(Object.keys(weeklyGoalSchema.shape).sort()).toEqual(javaStrings('GOAL_KEYS').sort());
  });
});

describe('numeric bounds: same limit values as PreferencesService.validate', () => {
  const zodFor: Record<string, (v: number) => boolean> = {
    'physical.weightKg': (v) => physicalSchema.shape.weightKg.safeParse(v).success,
    'physical.heightCm': (v) => physicalSchema.shape.heightCm.safeParse(v).success,
    'weeklyGoal.distanceM': (v) => weeklyGoalSchema.shape.distanceM.safeParse(v).success,
    'weeklyGoal.sessions': (v) => weeklyGoalSchema.shape.sessions.safeParse(v).success,
    'privacyZones.lat': (v) => privacyZoneSchema.shape.lat.safeParse(v).success,
    'privacyZones.lng': (v) => privacyZoneSchema.shape.lng.safeParse(v).success,
    'privacyZones.radiusM': (v) => privacyZoneSchema.shape.radiusM.safeParse(v).success,
  };

  it.each([...bounds.entries()])('%s accepts both its bounds', (path, { min, max }) => {
    expect(zodFor[path](min)).toBe(true);
    expect(zodFor[path](max)).toBe(true);
  });

  /**
   * Two points on each side: just beyond (decimal bound) and one unit beyond. The second
   * is essential for sessions, integers on the zod side: 0.999 is rejected there for its
   * decimal part, not for the bound, and would prove nothing.
   */
  it.each([...bounds.entries()])('%s rejects what goes beyond', (path, { min, max }) => {
    for (const outside of [min - 1e-6, min - 1, max + 1e-6, max + 1]) {
      expect(zodFor[path](outside)).toBe(false);
    }
  });

  it('the plausible age derived from the birth date has the same bounds', () => {
    const match = /age\s*<\s*(\d+)\s*\|\|\s*age\s*>\s*(\d+)/.exec(java);
    expect(match).not.toBeNull();
    expect(BIRTH_AGE_BOUNDS).toEqual({ min: Number(match?.[1]), max: Number(match?.[2]) });
  });
});

describe('default values', () => {
  /** `root.put("key", value)` and `root.putNull("key")` from `defaults()`. */
  function javaRootDefaults(): Record<string, unknown> {
    const body = /private ObjectNode defaults\(\) \{([\s\S]*?)\n    \}/.exec(java)?.[1] ?? '';
    const out: Record<string, unknown> = {};
    for (const m of body.matchAll(/root\.put\("(\w+)",\s*("?[\w]+"?)\)/g)) {
      out[m[1]] = m[2].startsWith('"') ? m[2].slice(1, -1) : m[2] === 'true';
    }
    for (const m of body.matchAll(/root\.putNull\("(\w+)"\)/g)) {
      out[m[1]] = null;
    }
    return out;
  }

  it('scalar defaults are those the backend serves', () => {
    const javaDefaults = javaRootDefaults();
    expect(Object.keys(javaDefaults).length).toBeGreaterThanOrEqual(6);
    for (const [key, value] of Object.entries(javaDefaults)) {
      expect({ key, value: (DEFAULT_PREFERENCES as Record<string, unknown>)[key] }).toEqual({
        key,
        value,
      });
    }
  });
});
