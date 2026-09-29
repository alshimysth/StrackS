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

/**
 * Âge plausible déduit de `birthDate`, miroir de `PreferencesService.validate` (#56).
 *
 * Volontairement **hors** de `physicalSchema` : ce schéma sert à relire le document
 * serveur, et un âge ne cesse d'augmenter — une date valide à l'écriture finirait par
 * sortir de la borne, et un échec de lecture ferait servir tous les défauts. La borne
 * ne sert qu'à valider une saisie avant l'envoi (voir `isPlausibleBirthDate`).
 */
export const BIRTH_AGE_BOUNDS = { min: 10, max: 120 } as const;

/**
 * Même calcul que `Period.between(date, today).getYears()` côté Java : années révolues.
 * Une date illisible n'est pas plausible.
 */
export function isPlausibleBirthDate(iso: string, today: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match == null) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return false; // 2026-02-30 : LocalDate.parse la refuse aussi
  }
  const [ty, tm, td] = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  const age = ty - year - (tm < month || (tm === month && td < day) ? 1 : 0);
  return age >= BIRTH_AGE_BOUNDS.min && age <= BIRTH_AGE_BOUNDS.max;
}

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

/**
 * Zone de confidentialité (#37) : les points du tracé situés dans le cercle ne sont pas
 * dessinés. Bornes miroir de `PreferencesService.validatePrivacyZones`.
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
    /** Allure ou vitesse, réglé PAR SPORT : un coureur et un marcheur ne lisent pas pareil. */
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
  .passthrough(); // lecture tolérante : on n'écrase pas ce qu'on ne comprend pas

export type Preferences = z.infer<typeof preferencesSchema>;

/**
 * Patch partiel. `null` remet une préférence à son défaut côté serveur — c'est
 * la seule façon d'effacer une valeur, il n'y a pas de DELETE par clé.
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

/** Le profil physique est-il exploitable pour estimer des calories ? */
export function hasWeight(preferences: Preferences): boolean {
  return typeof preferences.physical.weightKg === 'number' && preferences.physical.weightKg > 0;
}

/** Unité de mesure de la vitesse retenue pour un sport donné. */
export function speedDisplayFor(preferences: Preferences, sportCode: string): 'pace' | 'speed' {
  return preferences.sportDisplay[sportCode] ?? 'pace';
}
