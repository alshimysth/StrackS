/**
 * Miroir zod du schéma de préférences tenu par le backend
 * (`core/user/PreferencesService.java`). Les deux doivent rester alignés :
 * une divergence se traduirait par un 422 à l'enregistrement, côté utilisateur.
 *
 * Même asymétrie que le backend — tolérant en lecture, strict en écriture :
 * `preferencesSchema` accepte et ignore les clés inconnues (un backend plus
 * récent peut en renvoyer), tandis qu'un patch ne contient que des clés connues.
 */
import { z } from 'zod';

export const UNITS = ['metric', 'imperial'] as const;
export const THEMES = ['auto', 'light', 'dark'] as const;
export const GPS_MODES = ['max', 'balanced', 'saver'] as const;
export const SPEED_DISPLAYS = ['pace', 'speed'] as const;
export const SEXES = ['female', 'male', 'unspecified'] as const;

/** Bornes miroir de PreferencesService — elles attrapent l'unité inversée, pas l'atypique. */
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

export const preferencesSchema = z
  .object({
    units: z.enum(UNITS).default('metric'),
    theme: z.enum(THEMES).default('auto'),
    defaultSport: z.string().nullable().default(null),
    /** Allure ou vitesse, réglé PAR SPORT : un coureur et un marcheur ne lisent pas pareil. */
    sportDisplay: z.record(z.string(), z.enum(SPEED_DISPLAYS)).default({}),
    gpsMode: z.enum(GPS_MODES).default('balanced'),
    countdownEnabled: z.boolean().default(true),
    autoPauseEnabled: z.boolean().default(false),
    weeklyGoal: weeklyGoalSchema.default({ distanceM: null, sessions: null }),
    physical: physicalSchema.default({
      weightKg: null,
      heightCm: null,
      birthDate: null,
      sex: null,
    }),
  })
  .passthrough(); // lecture tolérante : on n'écrase pas ce qu'on ne comprend pas

export type Preferences = z.infer<typeof preferencesSchema>;

/**
 * Patch partiel. `null` remet une préférence à son défaut côté serveur — c'est
 * la seule façon d'effacer une valeur, il n'y a pas de DELETE par clé.
 */
export type PreferencesPatch = {
  [K in keyof Preferences]?: Preferences[K] | null;
};

export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});

/** Le profil physique est-il exploitable pour estimer des calories ? */
export function hasWeight(preferences: Preferences): boolean {
  return typeof preferences.physical.weightKg === 'number' && preferences.physical.weightKg > 0;
}

/** Unité de mesure de la vitesse retenue pour un sport donné. */
export function speedDisplayFor(preferences: Preferences, sportCode: string): 'pace' | 'speed' {
  return preferences.sportDisplay[sportCode] ?? 'pace';
}
