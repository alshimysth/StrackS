/**
 * Progress on weekly goals (#35).
 *
 * The design system reserves the lime "volt" accent for celebrations. Until now no goal
 * existed, so the product's signature colour had **no trigger**: that's the finding that
 * opened the ticket.
 *
 * Pure functions: the rule is testable without mounting a screen or calling the API.
 */

export interface WeeklyGoal {
  distanceM: number | null;
  sessions: number | null;
}

export interface WeekTotals {
  distanceM: number;
  sessions: number;
}

export interface GoalProgress {
  /** Completed share, capped at 1 for display (the bar doesn't overflow). */
  ratio: number;
  /** Real share, uncapped: useful to say "120 %" without lying. */
  rawRatio: number;
  reached: boolean;
  current: number;
  target: number;
}

function progress(current: number, target: number | null): GoalProgress | null {
  // Missing OR zero goal: no goal. The DoD requires "no goal set = no stray UI", so we
  // return null rather than a 0 % progress.
  if (target == null || target <= 0) {
    return null;
  }
  const rawRatio = current / target;
  return {
    ratio: Math.min(1, rawRatio),
    rawRatio,
    reached: current >= target,
    current,
    target,
  };
}

export function distanceProgress(totals: WeekTotals, goal: WeeklyGoal): GoalProgress | null {
  return progress(totals.distanceM, goal.distanceM);
}

export function sessionsProgress(totals: WeekTotals, goal: WeeklyGoal): GoalProgress | null {
  return progress(totals.sessions, goal.sessions);
}

/** Is any goal set at all? Drives the display on the home screen. */
export function hasGoal(goal: WeeklyGoal): boolean {
  return (goal.distanceM != null && goal.distanceM > 0) || (goal.sessions != null && goal.sessions > 0);
}

/**
 * Did THIS session just reach a goal?
 *
 * The nuance is the whole point: celebrating as soon as the total exceeds the goal would
 * replay the celebration on every session until the end of the week. So we compare the
 * state before and after: the session must be the one that crosses the line.
 */
export function goalJustReached(
  before: WeekTotals,
  after: WeekTotals,
  goal: WeeklyGoal,
): boolean {
  const crossed = (b: number, a: number, target: number | null) =>
    target != null && target > 0 && b < target && a >= target;
  return (
    crossed(before.distanceM, after.distanceM, goal.distanceM) ||
    crossed(before.sessions, after.sessions, goal.sessions)
  );
}
