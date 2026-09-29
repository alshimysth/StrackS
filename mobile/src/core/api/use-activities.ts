/**
 * Paginated history reads (story #23).
 *
 * Filtering is **server side**, explicitly the ticket's DoD. Filtering on the client
 * would give incomplete pages: the backend would return 20 activities of all sports, 3
 * of them matching the filter, and the screen would show "3 sessions" thinking it had
 * seen everything.
 */
import { useInfiniteQuery } from '@tanstack/react-query';

import type { Activity, Page } from '../../types/api';
import { api } from './client';

/** Windows offered by the screen. `all` sends no bound to the server. */
export type PeriodFilter = 'all' | 'week' | 'month' | 'year';

export interface ActivityFilters {
  sport?: string;
  period?: PeriodFilter;
}

const PAGE_SIZE = 20;

/** Lower bound of the period, in ISO 8601; `undefined` for "whole history". */
export function periodStart(period: PeriodFilter, now: Date = new Date()): string | undefined {
  if (period === 'all') return undefined;
  const from = new Date(now);
  if (period === 'week') from.setDate(from.getDate() - 7);
  if (period === 'month') from.setMonth(from.getMonth() - 1);
  if (period === 'year') from.setFullYear(from.getFullYear() - 1);
  return from.toISOString();
}

export function buildActivitiesPath(filters: ActivityFilters, page: number): string {
  const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
  if (filters.sport != null) {
    params.set('sport', filters.sport);
  }
  const from = periodStart(filters.period ?? 'all');
  if (from != null) {
    params.set('from', from);
  }
  return `/api/v1/activities?${params.toString()}`;
}

/**
 * The next page is derived from the total rather than from the size of the received
 * batch: an exactly full last batch would otherwise suggest one more page, and the user
 * would see an end-of-list spinner that never resolves.
 */
export function nextPageParam(last: Page<Activity>): number | undefined {
  const loaded = last.page * last.size + last.items.length;
  return loaded < last.total ? last.page + 1 : undefined;
}

export interface MonthSection {
  /** Stable `YYYY-MM` key, independent from the display locale. */
  key: string;
  title: string;
  data: Activity[];
}

/**
 * Groups activities by month for a `SectionList`.
 *
 * Arrival order is preserved: the backend already sorts by descending date, and sorting
 * again here would make the display diverge from pagination: page 2 would slip into the
 * middle of page 1 on each load.
 */
export function groupByMonth(activities: Activity[]): MonthSection[] {
  const sections: MonthSection[] = [];
  for (const activity of activities) {
    const date = new Date(activity.startedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const current = sections[sections.length - 1];
    if (current?.key === key) {
      current.data.push(activity);
    } else {
      sections.push({
        key,
        title: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        data: [activity],
      });
    }
  }
  return sections;
}

export function useActivities(filters: ActivityFilters = {}) {
  return useInfiniteQuery({
    // Filters are part of the key: switching sport doesn't recycle the previous sport's
    // pages, and each combination keeps its own persisted cache.
    queryKey: ['activities', filters.sport ?? 'all', filters.period ?? 'all'],
    queryFn: ({ pageParam }) => api<Page<Activity>>(buildActivitiesPath(filters, pageParam)),
    initialPageParam: 0,
    getNextPageParam: nextPageParam,
  });
}
