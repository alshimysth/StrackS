/**
 * Progression sur les objectifs hebdomadaires (#35).
 *
 * Le design system réserve l'accent lime « volt » aux célébrations. Jusqu'ici aucun
 * objectif n'existait, donc la couleur signature du produit n'avait **aucun
 * déclencheur** — c'est le constat qui ouvre le ticket.
 *
 * Fonctions pures : la règle se teste sans monter d'écran ni appeler l'API.
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
  /** Part accomplie, bornée à 1 pour l'affichage (la barre ne dépasse pas). */
  ratio: number;
  /** Part réelle, non bornée — utile pour dire « 120 % » sans mentir. */
  rawRatio: number;
  reached: boolean;
  current: number;
  target: number;
}

function progress(current: number, target: number | null): GoalProgress | null {
  // Objectif absent OU nul : pas d'objectif. La DoD exige « aucun objectif défini =
  // aucune UI parasite », donc on renvoie null plutôt qu'une progression à 0 %.
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

/** Un objectif est-il défini, quel qu'il soit ? Pilote l'affichage sur l'accueil. */
export function hasGoal(goal: WeeklyGoal): boolean {
  return (goal.distanceM != null && goal.distanceM > 0) || (goal.sessions != null && goal.sessions > 0);
}

/**
 * Un objectif vient-il d'être atteint par CETTE séance ?
 *
 * La nuance est tout le sujet : célébrer dès que le total dépasse l'objectif ferait
 * rejouer la célébration à chaque séance jusqu'à la fin de la semaine. On compare donc
 * l'état avant et après — la séance doit être celle qui fait franchir la ligne.
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
