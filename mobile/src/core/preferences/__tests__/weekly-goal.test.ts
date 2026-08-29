/**
 * Objectifs hebdomadaires (#35).
 *
 * DoD : « atteindre un objectif déclenche la célébration prévue au design » et
 * « aucun objectif défini = aucune UI parasite ».
 */
import {
  distanceProgress,
  goalJustReached,
  hasGoal,
  sessionsProgress,
} from '../weekly-goal';

const NO_GOAL = { distanceM: null, sessions: null };

describe('hasGoal', () => {
  it('est faux sans objectif', () => {
    expect(hasGoal(NO_GOAL)).toBe(false);
  });

  /** Un objectif à zéro n'est pas un objectif — sinon l'accueil afficherait 0 %. */
  it('traite un objectif nul comme absent', () => {
    expect(hasGoal({ distanceM: 0, sessions: 0 })).toBe(false);
  });

  it('est vrai dès qu’un des deux est défini', () => {
    expect(hasGoal({ distanceM: 20_000, sessions: null })).toBe(true);
    expect(hasGoal({ distanceM: null, sessions: 3 })).toBe(true);
  });
});

describe('progression', () => {
  const totals = { distanceM: 12_000, sessions: 2 };

  it('rend null quand l’objectif n’est pas défini', () => {
    expect(distanceProgress(totals, NO_GOAL)).toBeNull();
    expect(sessionsProgress(totals, NO_GOAL)).toBeNull();
  });

  it('calcule la part accomplie', () => {
    expect(distanceProgress(totals, { distanceM: 24_000, sessions: null })?.ratio).toBeCloseTo(0.5);
    expect(sessionsProgress(totals, { distanceM: null, sessions: 4 })?.ratio).toBeCloseTo(0.5);
  });

  /** La barre ne dépasse pas, mais le pourcentage réel reste disponible. */
  it('borne la barre sans mentir sur le dépassement', () => {
    const p = distanceProgress(totals, { distanceM: 10_000, sessions: null });
    expect(p?.ratio).toBe(1);
    expect(p?.rawRatio).toBeCloseTo(1.2);
    expect(p?.reached).toBe(true);
  });

  it('considère l’objectif atteint à l’égalité', () => {
    expect(distanceProgress(totals, { distanceM: 12_000, sessions: null })?.reached).toBe(true);
  });
});

describe('goalJustReached', () => {
  const goal = { distanceM: 20_000, sessions: null };

  /**
   * Le cœur de la règle : célébrer sur « total ≥ objectif » rejouerait la célébration
   * à chaque séance jusqu'à la fin de la semaine. Seule la séance qui franchit la
   * ligne compte.
   */
  it('célèbre la séance qui franchit la ligne', () => {
    expect(goalJustReached({ distanceM: 18_000, sessions: 3 }, { distanceM: 21_000, sessions: 4 }, goal)).toBe(true);
  });

  it('ne célèbre pas les séances suivantes', () => {
    expect(goalJustReached({ distanceM: 21_000, sessions: 4 }, { distanceM: 26_000, sessions: 5 }, goal)).toBe(false);
  });

  it('ne célèbre pas si l’objectif n’est pas atteint', () => {
    expect(goalJustReached({ distanceM: 5_000, sessions: 1 }, { distanceM: 9_000, sessions: 2 }, goal)).toBe(false);
  });

  it('ne célèbre rien sans objectif', () => {
    expect(goalJustReached({ distanceM: 0, sessions: 0 }, { distanceM: 99_000, sessions: 9 }, NO_GOAL)).toBe(false);
  });

  it('célèbre aussi sur l’objectif de séances', () => {
    const sessionsGoal = { distanceM: null, sessions: 3 };
    expect(goalJustReached({ distanceM: 0, sessions: 2 }, { distanceM: 5_000, sessions: 3 }, sessionsGoal)).toBe(true);
  });
});
