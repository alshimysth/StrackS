/**
 * The score of a racket match and its pure transitions (mirror of
 * `RacketSportPlugin.derive`): sets from the user's side, result by sets won.
 */
export type MatchFormat = 'singles' | 'doubles';

export interface SetScore {
  won: number;
  lost: number;
}

export interface RacketDraft {
  format: MatchFormat;
  sets: SetScore[];
}

export interface RacketRules {
  /** Highest score a set can reach (games for tennis, points elsewhere). */
  maxSetScore: number;
  maxSets: number;
}

export function initialRacketDraft(format: MatchFormat = 'singles'): RacketDraft {
  return { format, sets: [{ won: 0, lost: 0 }] };
}

export function setFormat(draft: RacketDraft, format: MatchFormat): RacketDraft {
  return { ...draft, format };
}

export function addSet(draft: RacketDraft, rules: RacketRules): RacketDraft {
  if (draft.sets.length >= rules.maxSets) {
    return draft;
  }
  return { ...draft, sets: [...draft.sets, { won: 0, lost: 0 }] };
}

export function removeSet(draft: RacketDraft, index: number): RacketDraft {
  if (draft.sets.length <= 1) {
    return draft;
  }
  return { ...draft, sets: draft.sets.filter((_, i) => i !== index) };
}

/** Bounded in [0, maxSetScore]: a tap past the ceiling does nothing rather than wrapping. */
export function adjustSet(
  draft: RacketDraft,
  index: number,
  side: keyof SetScore,
  delta: number,
  rules: RacketRules,
): RacketDraft {
  const sets = draft.sets.map((set, i) =>
    i === index
      ? { ...set, [side]: Math.min(rules.maxSetScore, Math.max(0, set[side] + delta)) }
      : set,
  );
  return { ...draft, sets };
}

/** Sets won / lost and the match result, exactly as the server derives them. */
export function matchOutcome(sets: SetScore[]): {
  setsWon: number;
  setsLost: number;
  result: 'win' | 'loss' | 'draw' | null;
} {
  let setsWon = 0;
  let setsLost = 0;
  for (const set of sets) {
    if (set.won > set.lost) {
      setsWon++;
    } else if (set.lost > set.won) {
      setsLost++;
    }
  }
  if (setsWon + setsLost === 0) {
    return { setsWon, setsLost, result: null };
  }
  return { setsWon, setsLost, result: setsWon > setsLost ? 'win' : setsWon < setsLost ? 'loss' : 'draw' };
}

/** The report sent at stop. An untouched 0-0 set is "no score kept", not a draw. */
export function racketMetricsFromDraft(draft: RacketDraft): Record<string, unknown> {
  return {
    schemaVersion: 1,
    format: draft.format,
    sets: draft.sets.filter((set) => set.won > 0 || set.lost > 0).map((set) => ({ won: set.won, lost: set.lost })),
  };
}

export const RESULT_LABELS: Record<'win' | 'loss' | 'draw', string> = {
  win: 'Victoire',
  loss: 'Défaite',
  draw: 'Égalité',
};
