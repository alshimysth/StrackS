/**
 * Reading statistics aggregates (#24).
 *
 * Everything is aggregated **server side**: the screen never pulls the period's
 * activities to add them up itself. It's the product decision of 2026-08-10, and it
 * directly serves #28's latency budget: a year of history is hundreds of sessions for
 * twelve displayed numbers.
 */
import { useQuery } from '@tanstack/react-query';

import type { PersonalRecords, StatsSummary, StatsTimeline } from '../../types/api';
import { api } from './client';

/** Windows offered by the screen, aligned on the calendar. */
export type StatsPeriod = 'week' | 'month' | 'year';

export const STATS_PERIODS: StatsPeriod[] = ['week', 'month', 'year'];

/**
 * Device time zone, sent to the server so it cuts weeks on the user's calendar. Without
 * it the backend falls back to UTC, and a Monday 00:30 run in Paris lands in the
 * previous week.
 */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // Some embedded JS engines don't expose the time zone database.
    return 'UTC';
  }
}

export interface StatsQuery {
  period: StatsPeriod;
  /** An instant WITHIN the wanted period, not its lower bound (month by month navigation). */
  anchor?: Date;
  sport?: string;
}

export function buildStatsPath(route: 'summary' | 'timeline', query: StatsQuery): string {
  const params = new URLSearchParams({ period: query.period, tz: deviceTimeZone() });
  if (query.sport != null) {
    params.set('sport', query.sport);
  }
  if (query.anchor != null) {
    params.set('from', query.anchor.toISOString());
  }
  return `/api/v1/stats/${route}?${params.toString()}`;
}

/** Cache key; includes the time zone: changing country changes the bucketing. */
function statsKey(route: string, query: StatsQuery) {
  return [
    'stats',
    route,
    query.period,
    query.sport ?? 'all',
    query.anchor?.toISOString() ?? 'now',
    deviceTimeZone(),
  ] as const;
}

export function useStatsSummary(query: StatsQuery) {
  return useQuery({
    queryKey: statsKey('summary', query),
    queryFn: () => api<StatsSummary>(buildStatsPath('summary', query)),
  });
}

/**
 * "All time" totals (#7), for the profile. Same route as the periods, with `period=all`:
 * no calendar window, no comparison.
 */
export function useAllTimeSummary() {
  return useQuery({
    queryKey: ['stats', 'summary', 'all', deviceTimeZone()] as const,
    queryFn: () =>
      api<StatsSummary>(
        `/api/v1/stats/summary?${new URLSearchParams({ period: 'all', tz: deviceTimeZone() }).toString()}`,
      ),
  });
}

/**
 * Personal records (#61), computed by the server over the whole history. Under the
 * `['stats', …]` key: finishing a session invalidates it with the other aggregates (#69).
 */
export function usePersonalRecords(sport: string | undefined) {
  return useQuery({
    queryKey: ['stats', 'records', sport ?? 'all'] as const,
    queryFn: () =>
      api<PersonalRecords>(
        `/api/v1/stats/records${sport != null ? `?sport=${encodeURIComponent(sport)}` : ''}`,
      ),
    enabled: sport != null,
  });
}

export function useStatsTimeline(query: StatsQuery) {
  return useQuery({
    queryKey: statsKey('timeline', query),
    queryFn: () => api<StatsTimeline>(buildStatsPath('timeline', query)),
  });
}

// ---------------------------------------------------------------------------
// Display derivations
// ---------------------------------------------------------------------------

/**
 * Relative change in percent, or `null` when it's meaningless.
 *
 * Starting from zero isn't "+100 %", it's a progression whose rate is undefined: the
 * screen then shows the raw value rather than a made-up percentage. It's the same rule
 * as "no calories without a known weight": better to say nothing than invent a number.
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

/** Formats a signed change: `+ 12 %`, `− 4 %`, `=` when unchanged. */
export function formatDelta(percent: number | null): string | null {
  if (percent == null) {
    return null;
  }
  const rounded = Math.round(percent);
  if (rounded === 0) {
    return '=';
  }
  // The typographic minus sign (U+2212), not the hyphen: it lines up with the plus and
  // doesn't break at the end of a line.
  return rounded > 0 ? `+ ${rounded} %` : `− ${Math.abs(rounded)} %`;
}

// ---------------------------------------------------------------------------
// Period navigation
// ---------------------------------------------------------------------------

/**
 * Shifts the anchor by a period, in calendar units: a month has no fixed duration, and
 * "minus 30 days" from March 31st would land on March 1st, the same month as the start.
 *
 * The day of month is **brought back to the 1st before any month or year shift**, and
 * that's essential: `setMonth` on March 31st produces a "February 31st" that JavaScript
 * normalizes to March 3rd. Going back a month from the 31st would therefore skip all of
 * February, and since the anchor starts from today's date, the bug would only show on the
 * 29th, 30th and 31st of each month. The anchor only designates the period, never a
 * specific day: this realignment loses nothing.
 */
export function shiftAnchor(period: StatsPeriod, anchor: Date, steps: number): Date {
  const shifted = new Date(anchor);
  if (period === 'week') {
    shifted.setDate(shifted.getDate() + steps * 7);
    return shifted;
  }
  shifted.setDate(1);
  if (period === 'month') {
    shifted.setMonth(shifted.getMonth() + steps);
  } else {
    shifted.setMonth(0);
    shifted.setFullYear(shifted.getFullYear() + steps);
  }
  return shifted;
}

/**
 * Can we move forward? Not if the next period hasn't started: offering "August" from
 * July while we're in July leads to an empty screen whose cause the user doesn't get.
 */
export function canGoForward(period: StatsPeriod, anchor: Date, now: Date = new Date()): boolean {
  return shiftAnchor(period, anchor, 1) <= now;
}

/** Title of the current window, in the UI language. */
export function periodTitle(period: StatsPeriod, anchor: Date): string {
  if (period === 'year') {
    return String(anchor.getFullYear());
  }
  if (period === 'month') {
    const label = anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const monday = new Date(anchor);
  // getDay(): 0 = Sunday. We bring it back to Monday, as the server does.
  const offset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset);
  return `Semaine du ${monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

/** Chart heading depending on the granularity returned by the server. */
export function chartTitle(bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'day') return 'Distance par jour';
  if (bucket === 'month') return 'Distance par mois';
  return 'Distance par semaine';
}
