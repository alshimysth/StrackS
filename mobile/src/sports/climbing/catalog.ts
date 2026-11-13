/**
 * Climbing family: bouldering and rope climbing. A timed sport with a log of climbs; the
 * server derives the counts and the hardest send (mirror of `ClimbingPlugin.java`).
 */
import { z } from 'zod';

import { colors } from '../../design-system/theme';
import type { IconName } from '../../design-system/components/Icon';
import type { Activity } from '../../types/api';
import type { SportCatalogEntry, StatsTotalDisplay } from '../types';
import { climbingMetricsFromDraft, initialClimbingDraft, type ClimbingDraft } from './draft';
import type { Discipline } from './grades';

const FAMILY = 'climbing';

export const climbingMetricsSchema = z.object({
  schemaVersion: z.literal(1),
  location: z.enum(['indoor', 'outdoor']).optional(),
  climbs: z
    .array(z.object({ grade: z.string(), result: z.string(), attempts: z.number().optional() }))
    .optional(),
  climbsCount: z.number().nonnegative().optional(),
  sendsCount: z.number().nonnegative().optional(),
  attemptsTotal: z.number().nonnegative().optional(),
  hardestSentGrade: z.string().optional(),
  hardestSentOrdinal: z.number().optional(),
});

export type ClimbingMetrics = z.infer<typeof climbingMetricsSchema>;

const statsTotals: StatsTotalDisplay[] = [
  { key: 'climbsCount', label: 'Blocs et voies', format: (v) => String(Math.round(v)) },
  { key: 'sendsCount', label: 'Réussites', format: (v) => String(Math.round(v)) },
];

export function parseClimbingMetrics(activity: Activity): ClimbingMetrics {
  const parsed = climbingMetricsSchema.safeParse(activity.metrics);
  return parsed.success ? parsed.data : { schemaVersion: 1 };
}

export interface ClimbingCatalogEntry extends SportCatalogEntry<ClimbingDraft> {
  code: Discipline;
  trackingMode: 'timer';
  /** "blocs" or "voies", for the summaries. */
  noun: string;
}

function createClimbingEntry(spec: {
  code: Discipline;
  label: string;
  icon: IconName;
  tagline: string;
  noun: string;
}): ClimbingCatalogEntry {
  return {
    code: spec.code,
    label: spec.label,
    family: FAMILY,
    icon: spec.icon,
    appearance: { label: spec.label, color: colors.warning600, tint: colors.warning100 },
    tagline: spec.tagline,
    trackingMode: 'timer',
    hasSpeed: false,
    noun: spec.noun,
    metricsSchema: climbingMetricsSchema,
    initialDraft: () => initialClimbingDraft(spec.code),
    metricsFromDraft: climbingMetricsFromDraft,
    headline: (activity) => {
      const metrics = parseClimbingMetrics(activity);
      if (metrics.climbsCount == null) {
        return null;
      }
      const hardest = metrics.hardestSentGrade != null ? ` · max ${metrics.hardestSentGrade}` : '';
      return `${metrics.climbsCount} ${spec.noun} · ${metrics.sendsCount ?? 0} réussis${hardest}`;
    },
    statsTotals,
  };
}

export const boulderingEntry = createClimbingEntry({
  code: 'bouldering',
  label: 'Bloc',
  icon: 'sport-boulder',
  tagline: 'Chrono · cotations Fontainebleau',
  noun: 'blocs',
});

export const ropeClimbingEntry = createClimbingEntry({
  code: 'rope_climbing',
  label: 'Voie',
  icon: 'sport-rope',
  tagline: 'Chrono · à vue, flash, après travail',
  noun: 'voies',
});
