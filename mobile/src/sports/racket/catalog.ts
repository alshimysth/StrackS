/**
 * Racket family: tennis, padel, badminton, squash, table tennis. One factory, five rule
 * sets (mirror of the backend `RacketSportPlugin` subclasses).
 */
import { z } from 'zod';

import { colors } from '../../design-system/theme';
import type { Activity } from '../../types/api';
import type { SportCatalogEntry, StatsTotalDisplay } from '../types';
import { RESULT_LABELS, initialRacketDraft, racketMetricsFromDraft, type RacketDraft, type RacketRules } from './score';

const FAMILY = 'racket';

export const racketMetricsSchema = z.object({
  schemaVersion: z.literal(1),
  format: z.enum(['singles', 'doubles']).optional(),
  sets: z.array(z.object({ won: z.number(), lost: z.number() })).optional(),
  setsWon: z.number().nonnegative().optional(),
  setsLost: z.number().nonnegative().optional(),
  result: z.enum(['win', 'loss', 'draw']).optional(),
});

export type RacketMetrics = z.infer<typeof racketMetricsSchema>;

const statsTotals: StatsTotalDisplay[] = [
  { key: 'matchesWon', label: 'Victoires', format: (v) => String(Math.round(v)) },
  { key: 'matchesLost', label: 'Défaites', format: (v) => String(Math.round(v)) },
  { key: 'setsWon', label: 'Sets gagnés', format: (v) => String(Math.round(v)) },
];

export function parseRacketMetrics(activity: Activity): RacketMetrics {
  const parsed = racketMetricsSchema.safeParse(activity.metrics);
  return parsed.success ? parsed.data : { schemaVersion: 1 };
}

export function scoreLine(metrics: RacketMetrics): string | null {
  if (metrics.sets == null || metrics.sets.length === 0) {
    return null;
  }
  return metrics.sets.map((set) => `${set.won}–${set.lost}`).join(', ');
}

export interface RacketCatalogEntry extends SportCatalogEntry<RacketDraft> {
  trackingMode: 'timer';
  rules: RacketRules;
  /** "jeux" for tennis, "points" elsewhere. */
  scoreNoun: string;
  defaultFormat: 'singles' | 'doubles';
}

function createRacketEntry(spec: {
  code: string;
  label: string;
  tagline: string;
  rules: RacketRules;
  scoreNoun: string;
  defaultFormat?: 'singles' | 'doubles';
}): RacketCatalogEntry {
  const defaultFormat = spec.defaultFormat ?? 'singles';
  return {
    code: spec.code,
    label: spec.label,
    family: FAMILY,
    icon: 'sport-racket',
    appearance: { label: spec.label, color: colors.success600, tint: colors.success100 },
    tagline: spec.tagline,
    trackingMode: 'timer',
    hasSpeed: false,
    rules: spec.rules,
    scoreNoun: spec.scoreNoun,
    defaultFormat,
    metricsSchema: racketMetricsSchema,
    initialDraft: () => initialRacketDraft(defaultFormat),
    metricsFromDraft: racketMetricsFromDraft,
    headline: (activity) => {
      const metrics = parseRacketMetrics(activity);
      if (metrics.result == null) {
        return null;
      }
      const score = scoreLine(metrics);
      return `${RESULT_LABELS[metrics.result]}${score != null ? ` · ${score}` : ''}`;
    },
    statsTotals,
  };
}

/** Rules mirror the backend plugins: tennis/padel in games, the others in points. */
export const tennisEntry = createRacketEntry({
  code: 'tennis',
  label: 'Tennis',
  tagline: 'Chrono · score en sets',
  rules: { maxSetScore: 7, maxSets: 5 },
  scoreNoun: 'jeux',
});

export const padelEntry = createRacketEntry({
  code: 'padel',
  label: 'Padel',
  tagline: 'Chrono · score en sets, en double',
  rules: { maxSetScore: 7, maxSets: 3 },
  scoreNoun: 'jeux',
  defaultFormat: 'doubles',
});

export const badmintonEntry = createRacketEntry({
  code: 'badminton',
  label: 'Badminton',
  tagline: 'Chrono · manches en 21 points',
  rules: { maxSetScore: 30, maxSets: 3 },
  scoreNoun: 'points',
});

export const squashEntry = createRacketEntry({
  code: 'squash',
  label: 'Squash',
  tagline: 'Chrono · jeux en 11 points',
  rules: { maxSetScore: 30, maxSets: 5 },
  scoreNoun: 'points',
});

export const tableTennisEntry = createRacketEntry({
  code: 'table_tennis',
  label: 'Tennis de table',
  tagline: 'Chrono · manches en 11 points',
  rules: { maxSetScore: 60, maxSets: 7 },
  scoreNoun: 'points',
});

export const racketEntries = [tennisEntry, padelEntry, badmintonEntry, squashEntry, tableTennisEntry];
