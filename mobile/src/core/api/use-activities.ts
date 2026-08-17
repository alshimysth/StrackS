/**
 * Lecture paginée de l'historique (Story #23).
 *
 * Le filtrage est **serveur** — c'est explicitement la DoD du ticket. Filtrer côté
 * client donnerait des pages incomplètes : le backend renverrait 20 activités tous
 * sports confondus, dont 3 correspondant au filtre, et l'écran afficherait « 3 séances »
 * en croyant avoir tout vu.
 */
import { useInfiniteQuery } from '@tanstack/react-query';

import type { Activity, Page } from '../../types/api';
import { api } from './client';

/** Fenêtres proposées par l'écran. `all` n'envoie aucune borne au serveur. */
export type PeriodFilter = 'all' | 'week' | 'month' | 'year';

export interface ActivityFilters {
  sport?: string;
  period?: PeriodFilter;
}

const PAGE_SIZE = 20;

/** Borne basse de la période, en ISO 8601 — `undefined` pour « tout l'historique ». */
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
 * La page suivante se déduit du total plutôt que de la taille du lot reçu : un dernier
 * lot exactement plein ferait sinon croire à une page supplémentaire, et l'utilisateur
 * verrait un spinner de bas de liste qui ne se résout jamais.
 */
export function nextPageParam(last: Page<Activity>): number | undefined {
  const loaded = last.page * last.size + last.items.length;
  return loaded < last.total ? last.page + 1 : undefined;
}

export interface MonthSection {
  /** Clé stable `AAAA-MM`, indépendante de la locale d'affichage. */
  key: string;
  title: string;
  data: Activity[];
}

/**
 * Regroupe les activités par mois pour une `SectionList`.
 *
 * L'ordre d'arrivée est préservé — le backend trie déjà par date décroissante, et
 * retrier ici ferait diverger l'affichage de la pagination : la page 2 se glisserait
 * au milieu de la page 1 à chaque chargement.
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
    // Les filtres font partie de la clé : changer de sport ne recycle pas les pages
    // du sport précédent, et chaque combinaison garde son propre cache persisté.
    queryKey: ['activities', filters.sport ?? 'all', filters.period ?? 'all'],
    queryFn: ({ pageParam }) => api<Page<Activity>>(buildActivitiesPath(filters, pageParam)),
    initialPageParam: 0,
    getNextPageParam: nextPageParam,
  });
}
