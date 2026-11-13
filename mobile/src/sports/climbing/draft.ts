/**
 * The climbing session draft and its pure transitions. Isolated from rendering: this is
 * the business rule of a climbing log, testable without mounting a screen.
 */
import { gradeOrdinal, parseGrade, type Discipline } from './grades';

export type BoulderResult = 'flash' | 'send' | 'attempt';
export type RopeResult = 'onsight' | 'flash' | 'redpoint' | 'attempt';
export type ClimbResult = BoulderResult | RopeResult;

export interface Climb {
  grade: string;
  result: ClimbResult;
  attempts: number;
}

export interface ClimbingDraft {
  location: 'indoor' | 'outdoor';
  climbs: Climb[];
  /** Grade preselected for the next climb: the last one logged, a climber repeats a level. */
  nextGrade: string;
}

export const RESULTS: Record<Discipline, { value: ClimbResult; label: string }[]> = {
  bouldering: [
    { value: 'flash', label: 'Flash' },
    { value: 'send', label: 'Réussi' },
    { value: 'attempt', label: 'Essai' },
  ],
  rope_climbing: [
    { value: 'onsight', label: 'À vue' },
    { value: 'flash', label: 'Flash' },
    { value: 'redpoint', label: 'Après travail' },
    { value: 'attempt', label: 'Essai' },
  ],
};

export function isSend(result: ClimbResult): boolean {
  return result !== 'attempt';
}

export function initialClimbingDraft(discipline: Discipline): ClimbingDraft {
  return { location: 'indoor', climbs: [], nextGrade: discipline === 'bouldering' ? '5' : '5c' };
}

/** Mirror of ClimbingPlugin.MAX_CLIMBS: the server refuses a longer report as a whole. */
export const MAX_CLIMBS = 200;

export function addClimb(draft: ClimbingDraft, climb: Climb): ClimbingDraft {
  if (draft.climbs.length >= MAX_CLIMBS) {
    return draft;
  }
  return { ...draft, climbs: [...draft.climbs, climb], nextGrade: climb.grade };
}

export function removeClimb(draft: ClimbingDraft, index: number): ClimbingDraft {
  return { ...draft, climbs: draft.climbs.filter((_, i) => i !== index) };
}

export function setLocation(draft: ClimbingDraft, location: ClimbingDraft['location']): ClimbingDraft {
  return { ...draft, location };
}

/** Counts shown live, same definitions as the server's derived keys. */
export function climbingTotals(draft: ClimbingDraft, discipline: Discipline) {
  let sends = 0;
  let hardest: { label: string; ordinal: number } | null = null;
  for (const climb of draft.climbs) {
    if (!isSend(climb.result)) {
      continue;
    }
    sends++;
    const grade = parseGrade(climb.grade, discipline);
    if (grade != null) {
      const ordinal = gradeOrdinal(grade);
      if (hardest == null || ordinal > hardest.ordinal) {
        hardest = { label: climb.grade, ordinal };
      }
    }
  }
  return { climbs: draft.climbs.length, sends, hardest: hardest?.label ?? null };
}

/** The report sent at stop: only what the backend schema declares as input. */
export function climbingMetricsFromDraft(draft: ClimbingDraft): Record<string, unknown> {
  return {
    schemaVersion: 1,
    location: draft.location,
    climbs: draft.climbs.map((c) => ({
      grade: c.grade,
      result: c.result,
      attempts: Math.max(1, Math.round(c.attempts)),
    })),
  };
}
