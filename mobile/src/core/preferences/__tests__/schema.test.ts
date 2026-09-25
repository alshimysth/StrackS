/**
 * Schéma de préférences côté mobile (#56) : défauts, tolérance de lecture, helpers.
 * La parité des bornes avec le backend vit dans `schema.parity.test.ts`.
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
  it('produit tous les défauts depuis un document vide', () => {
    expect(preferencesSchema.parse({})).toEqual({
      units: 'metric',
      theme: 'auto',
      defaultSport: null,
      sportDisplay: {},
      gpsMode: 'balanced',
      countdownEnabled: true,
      autoPauseEnabled: false,
      weeklyGoal: { distanceM: null, sessions: null },
      physical: { weightKg: null, heightCm: null, birthDate: null, sex: null },
    });
  });

  /** Contrat avec un backend plus récent : une clé inconnue survit au parsing. */
  it('conserve une clé inconnue plutôt que de la jeter', () => {
    const parsed = preferencesSchema.parse({ units: 'imperial', heartRateZones: [120, 140] });
    expect(parsed).toMatchObject({ units: 'imperial', heartRateZones: [120, 140] });
  });

  it('complète un document partiel par les défauts', () => {
    const parsed = preferencesSchema.parse({ weeklyGoal: { sessions: 3 } });
    expect(parsed.weeklyGoal).toEqual({ distanceM: null, sessions: 3 });
    expect(parsed.theme).toBe('auto');
  });

  it('refuse une valeur hors liste', () => {
    expect(preferencesSchema.safeParse({ theme: 'sepia' }).success).toBe(false);
  });
});

describe('isPlausibleBirthDate', () => {
  const today = new Date(2026, 8, 25); // 25 septembre 2026, heure locale

  it.each([
    ['2016-09-25', true], // 10 ans aujourd'hui
    ['2016-09-26', false], // 10 ans demain seulement
    ['1906-09-25', true], // 120 ans aujourd'hui
    ['1905-09-24', false], // 121 ans
    ['1990-06-15', true],
  ])('%s → %s', (iso, expected) => {
    expect(isPlausibleBirthDate(iso, today)).toBe(expected);
  });

  it.each(['2026-02-30', '15/06/1990', '1990-6-15', ''])('refuse la date illisible « %s »', (iso) => {
    expect(isPlausibleBirthDate(iso, today)).toBe(false);
  });
});

describe('helpers', () => {
  const withPrefs = (patch: Partial<Preferences>): Preferences => ({
    ...DEFAULT_PREFERENCES,
    ...patch,
  });

  it('speedDisplayFor retombe sur l’allure quand rien n’est réglé', () => {
    expect(speedDisplayFor(DEFAULT_PREFERENCES, 'walking')).toBe('pace');
  });

  it('speedDisplayFor lit le réglage du sport, pas celui d’un autre', () => {
    const prefs = withPrefs({ sportDisplay: { walking: 'speed' } });
    expect(speedDisplayFor(prefs, 'walking')).toBe('speed');
    expect(speedDisplayFor(prefs, 'running')).toBe('pace');
  });

  it('hasWeight est faux sur un profil vide, vrai une fois le poids renseigné', () => {
    expect(hasWeight(DEFAULT_PREFERENCES)).toBe(false);
    const physical = { ...DEFAULT_PREFERENCES.physical, weightKg: 72 };
    expect(hasWeight(withPrefs({ physical }))).toBe(true);
  });
});
