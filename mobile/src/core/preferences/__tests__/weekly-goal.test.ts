/**
 * Weekly goals (#35).
 *
 * DoD: "reaching a goal triggers the celebration planned in the design" and "no goal set
 * = no stray UI".
 */
import {
  distanceProgress,
  goalJustReached,
  hasGoal,
  sessionsProgress,
} from '../weekly-goal';

const NO_GOAL = { distanceM: null, sessions: null };

describe('hasGoal', () => {
  it('is false without a goal', () => {
    expect(hasGoal(NO_GOAL)).toBe(false);
  });

  /** A zero goal isn't a goal; otherwise the home screen would show 0 %. */
  it('treats a zero goal as absent', () => {
    expect(hasGoal({ distanceM: 0, sessions: 0 })).toBe(false);
  });

  it('is true as soon as either one is set', () => {
    expect(hasGoal({ distanceM: 20_000, sessions: null })).toBe(true);
    expect(hasGoal({ distanceM: null, sessions: 3 })).toBe(true);
  });
});

describe('progress', () => {
  const totals = { distanceM: 12_000, sessions: 2 };

  it('returns null when the goal is not set', () => {
    expect(distanceProgress(totals, NO_GOAL)).toBeNull();
    expect(sessionsProgress(totals, NO_GOAL)).toBeNull();
  });

  it('computes the completed share', () => {
    expect(distanceProgress(totals, { distanceM: 24_000, sessions: null })?.ratio).toBeCloseTo(0.5);
    expect(sessionsProgress(totals, { distanceM: null, sessions: 4 })?.ratio).toBeCloseTo(0.5);
  });

  /** The bar doesn't overflow, but the real percentage stays available. */
  it('caps the bar without lying about exceeding', () => {
    const p = distanceProgress(totals, { distanceM: 10_000, sessions: null });
    expect(p?.ratio).toBe(1);
    expect(p?.rawRatio).toBeCloseTo(1.2);
    expect(p?.reached).toBe(true);
  });

  it('considers the goal reached on equality', () => {
    expect(distanceProgress(totals, { distanceM: 12_000, sessions: null })?.reached).toBe(true);
  });
});

describe('goalJustReached', () => {
  const goal = { distanceM: 20_000, sessions: null };

  /**
   * The heart of the rule: celebrating on "total ≥ goal" would replay the celebration on
   * every session until the end of the week. Only the session crossing the line counts.
   */
  it('celebrates the session that crosses the line', () => {
    expect(goalJustReached({ distanceM: 18_000, sessions: 3 }, { distanceM: 21_000, sessions: 4 }, goal)).toBe(true);
  });

  it('does not celebrate the following sessions', () => {
    expect(goalJustReached({ distanceM: 21_000, sessions: 4 }, { distanceM: 26_000, sessions: 5 }, goal)).toBe(false);
  });

  it('does not celebrate if the goal is not reached', () => {
    expect(goalJustReached({ distanceM: 5_000, sessions: 1 }, { distanceM: 9_000, sessions: 2 }, goal)).toBe(false);
  });

  it('celebrates nothing without a goal', () => {
    expect(goalJustReached({ distanceM: 0, sessions: 0 }, { distanceM: 99_000, sessions: 9 }, NO_GOAL)).toBe(false);
  });

  it('also celebrates on the sessions goal', () => {
    const sessionsGoal = { distanceM: null, sessions: 3 };
    expect(goalJustReached({ distanceM: 0, sessions: 2 }, { distanceM: 5_000, sessions: 3 }, sessionsGoal)).toBe(true);
  });
});
