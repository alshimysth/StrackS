/**
 * Parité du miroir zod avec `PreferencesService.java` (#56).
 *
 * Une divergence entre les deux côtés ne se voit pas à la compilation : elle se voit en
 * production, sous la forme d'un 422 incompréhensible quand l'utilisateur enregistre un
 * réglage que le front croyait valide. Même risque que celui qui justifie la parité
 * `metrics.ts` ↔ `GpsComputations.java` (#40).
 *
 * **Les valeurs attendues sont lues dans le source Java**, pas recopiées ici : modifier
 * une borne, une liste de valeurs ou une clé côté backend sans la répercuter dans
 * `schema.ts` fait échouer cette suite. Des valeurs recopiées ne protégeraient de rien —
 * elles resteraient vraies pendant que le backend change.
 *
 * `mobile-ci.yml` se déclenche aussi sur ce fichier Java, sans quoi une modification
 * du seul backend ne ferait jamais tourner ce test.
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
  weeklyGoalSchema,
} from '../schema';

const JAVA_PATH = resolve(
  __dirname,
  '../../../../../backend/src/main/java/com/stracks/core/user/PreferencesService.java',
);
const java = readFileSync(JAVA_PATH, 'utf8');

/** `List.of("a", "b")` ou `Set.of(...)` assigné à la constante `name`. */
function javaStrings(name: string): string[] {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:List|Set)\\.of\\(([^)]*)\\)`, 's').exec(java);
  if (match == null) {
    throw new Error(`Constante ${name} introuvable dans PreferencesService.java`);
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Bornes des appels `positiveNumber(parent, "chemin", valeur, min, max)`. */
function javaBounds(): Map<string, { min: number; max: number }> {
  const bounds = new Map<string, { min: number; max: number }>();
  const re = /positiveNumber\(\s*\w+,\s*"([^"]+)",[^;]*?,\s*([\d_.]+),\s*([\d_.]+)\s*\);/g;
  for (const m of java.matchAll(re)) {
    bounds.set(m[1], { min: Number(m[2].replace(/_/g, '')), max: Number(m[3].replace(/_/g, '')) });
  }
  return bounds;
}

const bounds = javaBounds();

describe('lecture du source Java (garde-fou du test lui-même)', () => {
  it('trouve les quatre bornes numériques', () => {
    // Si le Java est refactoré, ce test doit casser bruyamment plutôt que de ne plus
    // rien comparer du tout.
    expect([...bounds.keys()].sort()).toEqual([
      'physical.heightCm',
      'physical.weightKg',
      'weeklyGoal.distanceM',
      'weeklyGoal.sessions',
    ]);
  });
});

describe('valeurs autorisées', () => {
  it.each([
    ['UNITS', UNITS],
    ['THEMES', THEMES],
    ['GPS_MODES', GPS_MODES],
    ['SPEED_DISPLAYS', SPEED_DISPLAYS],
    ['SEXES', SEXES],
  ])('%s est identique des deux côtés', (name, values) => {
    expect([...values]).toEqual(javaStrings(name));
  });
});

describe('clés connues', () => {
  /** `.passthrough()` ne retire rien : on compare la forme déclarée, pas une sortie. */
  it('les clés racine sont celles que le backend accepte en écriture', () => {
    expect(Object.keys(preferencesSchema.shape).sort()).toEqual(javaStrings('ROOT_KEYS').sort());
  });

  it('les clés du profil physique sont les mêmes', () => {
    expect(Object.keys(physicalSchema.shape).sort()).toEqual(javaStrings('PHYSICAL_KEYS').sort());
  });

  it('les clés de l’objectif hebdomadaire sont les mêmes', () => {
    expect(Object.keys(weeklyGoalSchema.shape).sort()).toEqual(javaStrings('GOAL_KEYS').sort());
  });
});

describe('bornes numériques — mêmes valeurs limites que PreferencesService.validate', () => {
  const zodFor: Record<string, (v: number) => boolean> = {
    'physical.weightKg': (v) => physicalSchema.shape.weightKg.safeParse(v).success,
    'physical.heightCm': (v) => physicalSchema.shape.heightCm.safeParse(v).success,
    'weeklyGoal.distanceM': (v) => weeklyGoalSchema.shape.distanceM.safeParse(v).success,
    'weeklyGoal.sessions': (v) => weeklyGoalSchema.shape.sessions.safeParse(v).success,
  };

  it.each([...bounds.entries()])('%s accepte ses deux bornes', (path, { min, max }) => {
    expect(zodFor[path](min)).toBe(true);
    expect(zodFor[path](max)).toBe(true);
  });

  /**
   * Deux points de chaque côté : juste au-delà (borne décimale) et une unité au-delà.
   * Le second est indispensable pour les séances, entières côté zod : 0,999 y est
   * refusé pour sa partie décimale, pas pour la borne, et ne prouverait rien.
   */
  it.each([...bounds.entries()])('%s refuse ce qui dépasse', (path, { min, max }) => {
    for (const outside of [min - 1e-6, min - 1, max + 1e-6, max + 1]) {
      expect(zodFor[path](outside)).toBe(false);
    }
  });

  it('l’âge plausible déduit de la date de naissance a les mêmes bornes', () => {
    const match = /age\s*<\s*(\d+)\s*\|\|\s*age\s*>\s*(\d+)/.exec(java);
    expect(match).not.toBeNull();
    expect(BIRTH_AGE_BOUNDS).toEqual({ min: Number(match?.[1]), max: Number(match?.[2]) });
  });
});

describe('valeurs par défaut', () => {
  /** `root.put("clé", valeur)` et `root.putNull("clé")` de `defaults()`. */
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

  it('les défauts scalaires sont ceux que sert le backend', () => {
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
