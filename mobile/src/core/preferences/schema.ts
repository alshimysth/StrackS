/**
 * zod mirror of the preferences schema held by the backend
 * (`core/user/PreferencesService.java`). Both must stay aligned: a divergence would show
 * up as a 422 on save, on the user's side.
 *
 * Same asymmetry as the backend, tolerant on read, strict on write: `preferencesSchema`
 * accepts and ignores unknown keys (a more recent backend may return some), while a patch
 * only contains known keys.
 */
import { z } from 'zod';

export const UNITS = ['metric', 'imperial'] as const;
export const THEMES = ['auto', 'light', 'dark'] as const;
export const GPS_MODES = ['max', 'balanced', 'saver'] as const;
export const SPEED_DISPLAYS = ['pace', 'speed'] as const;
export const SEXES = ['female', 'male', 'unspecified'] as const;

/**
 * Plausible age derived from `birthDate`, mirror of `PreferencesService.validate` (#56).
 *
 * Deliberately **outside** `physicalSchema`: that schema reads the server document back,
 * and an age keeps increasing; a date valid when written would end up outside the bound,
 * and a read failure would serve all the defaults. The bound only validates an input
 * before sending (see `isPlausibleBirthDate`).
 */
export const BIRTH_AGE_BOUNDS = { min: 10, max: 120 } as const;

/**
 * Same computation as `Period.between(date, today).getYears()` on the Java side: completed
 * years. An unreadable date isn't plausible.
 */
export function isPlausibleBirthDate(iso: string, today: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match == null) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return false; // 2026-02-30: LocalDate.parse rejects it too
  }
  const [ty, tm, td] = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  const age = ty - year - (tm < month || (tm === month && td < day) ? 1 : 0);
  return age >= BIRTH_AGE_BOUNDS.min && age <= BIRTH_AGE_BOUNDS.max;
}

/** Bounds mirroring PreferencesService: they catch a swapped unit, not the atypical user. */
export const physicalSchema = z.object({
  weightKg: z.number().min(30).max(300).nullable().default(null),
  heightCm: z.number().min(80).max(260).nullable().default(null),
  birthDate: z.string().nullable().default(null), // ISO YYYY-MM-DD
  sex: z.enum(SEXES).nullable().default(null),
});

export const weeklyGoalSchema = z.object({
  distanceM: z.number().min(100).max(1_000_000).nullable().default(null),
  sessions: z.number().int().min(1).max(50).nullable().default(null),
});

/**
 * Privacy zone (#37): track points inside the circle aren't drawn. Bounds mirroring
 * `PreferencesService.validatePrivacyZones`.
 */
export const privacyZoneSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().min(100).max(2000),
  label: z.string().max(40).nullable().default(null),
});

export type PrivacyZone = z.infer<typeof privacyZoneSchema>;

export const MAX_PRIVACY_ZONES = 5;

export const preferencesSchema = z
  .object({
    units: z.enum(UNITS).default('metric'),
    theme: z.enum(THEMES).default('auto'),
    defaultSport: z.string().nullable().default(null),
    /** Pace or speed, set PER SPORT: a runner and a walker don't read the same way. */
    sportDisplay: z.record(z.string(), z.enum(SPEED_DISPLAYS)).default({}),
    gpsMode: z.enum(GPS_MODES).default('balanced'),
    countdownEnabled: z.boolean().default(true),
    autoPauseEnabled: z.boolean().default(false),
    weeklyGoal: weeklyGoalSchema.default({ distanceM: null, sessions: null }),
    privacyZones: z.array(privacyZoneSchema).max(MAX_PRIVACY_ZONES).default([]),
    physical: physicalSchema.default({
      weightKg: null,
      heightCm: null,
      birthDate: null,
      sex: null,
    }),
  })
  .passthrough(); // tolerant read: we don't overwrite what we don't understand

export type Preferences = z.infer<typeof preferencesSchema>;

/**
 * Partial patch. `null` resets a preference to its default on the server; it's the only
 * way to clear a value, there is no per-key DELETE.
 */
export type PreferencesPatch = {
  /**
   * Les objets imbriqués (`physical`, `weeklyGoal`, `sportDisplay`) sont fusionnés clé par
   * clé côté serveur : un patch n'en porte que les clés modifiées. Les exiger complets
   * pousserait à recopier des valeurs périmées, que le serveur appliquerait (revue PR #80).
   * Les listes, elles, sont remplacées d'un bloc.
   */
  [K in keyof Preferences]?:
    | (Preferences[K] extends unknown[]
        ? Preferences[K]
        : Preferences[K] extends Record<string, unknown>
          ? Partial<Preferences[K]>
          : Preferences[K])
    | null;
};

export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});

/** Is the athlete profile usable to estimate calories? */
export function hasWeight(preferences: Preferences): boolean {
  return typeof preferences.physical.weightKg === 'number' && preferences.physical.weightKg > 0;
}

/** Speed display unit chosen for a given sport. */
export function speedDisplayFor(preferences: Preferences, sportCode: string): 'pace' | 'speed' {
  return preferences.sportDisplay[sportCode] ?? 'pace';
}
