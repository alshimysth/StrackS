/**
 * Lecture des agrégats statistiques (#24).
 *
 * Tout est agrégé **côté serveur** : l'écran ne rapatrie jamais les activités de
 * la période pour les additionner lui-même. C'est la décision produit du
 * 2026-08-10, et elle sert directement le budget de latence de #28 — un an
 * d'historique représente des centaines de séances pour douze nombres affichés.
 */
import { useQuery } from '@tanstack/react-query';

import type { StatsSummary, StatsTimeline } from '../../types/api';
import { api } from './client';

/** Fenêtres proposées par l'écran, alignées sur le calendrier. */
export type StatsPeriod = 'week' | 'month' | 'year';

export const STATS_PERIODS: StatsPeriod[] = ['week', 'month', 'year'];

/**
 * Fuseau de l'appareil, envoyé au serveur pour qu'il découpe les semaines sur le
 * calendrier de l'utilisateur. Sans lui le backend retombe sur UTC, et une sortie
 * du lundi 00h30 à Paris bascule dans la semaine précédente.
 */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // Certains moteurs JS embarqués n'exposent pas la base de fuseaux.
    return 'UTC';
  }
}

export interface StatsQuery {
  period: StatsPeriod;
  /** Instant DANS la période voulue — pas sa borne basse (navigation mois par mois). */
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

/** Clé de cache — inclut le fuseau : changer de pays change le découpage. */
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

export function useStatsTimeline(query: StatsQuery) {
  return useQuery({
    queryKey: statsKey('timeline', query),
    queryFn: () => api<StatsTimeline>(buildStatsPath('timeline', query)),
  });
}

// ---------------------------------------------------------------------------
// Dérivations d'affichage
// ---------------------------------------------------------------------------

/**
 * Évolution relative en pourcentage, ou `null` quand elle n'a pas de sens.
 *
 * Partir de zéro n'est pas « +100 % », c'est une progression dont le taux n'est
 * pas défini : l'écran affiche alors la valeur brute plutôt qu'un pourcentage
 * fabriqué. C'est la même règle que « pas de calories sans poids connu » —
 * mieux vaut ne rien dire qu'inventer un chiffre.
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

/** Formate une évolution signée : `+ 12 %`, `− 4 %`, `=` à l'identique. */
export function formatDelta(percent: number | null): string | null {
  if (percent == null) {
    return null;
  }
  const rounded = Math.round(percent);
  if (rounded === 0) {
    return '=';
  }
  // Le signe moins typographique (U+2212), pas le trait d'union : il s'aligne
  // sur le plus et ne se coupe pas en fin de ligne.
  return rounded > 0 ? `+ ${rounded} %` : `− ${Math.abs(rounded)} %`;
}

// ---------------------------------------------------------------------------
// Navigation de période
// ---------------------------------------------------------------------------

/**
 * Décale l'ancre d'une période, en unités de calendrier — un mois n'a pas de
 * durée fixe, et « moins 30 jours » depuis le 31 mars atterrirait le 1er mars,
 * soit le même mois qu'au départ.
 *
 * Le quantième est **ramené au 1er avant tout décalage de mois ou d'année**, et
 * c'est indispensable : `setMonth` sur un 31 mars produit un « 31 février » que
 * JavaScript normalise en 3 mars. Reculer d'un mois depuis le 31 sauterait donc
 * février entier — et comme l'ancre part de la date du jour, le bug ne se
 * manifesterait que les 29, 30 et 31 de chaque mois. L'ancre ne sert qu'à
 * désigner la période, jamais un jour précis : ce recalage ne perd rien.
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
 * Peut-on avancer ? Non si la période suivante n'a pas commencé — proposer
 * « août » depuis juillet alors qu'on est en juillet mène à un écran vide dont
 * l'utilisateur ne comprend pas la cause.
 */
export function canGoForward(period: StatsPeriod, anchor: Date, now: Date = new Date()): boolean {
  return shiftAnchor(period, anchor, 1) <= now;
}

/** Titre de la fenêtre courante, dans la langue de l'interface. */
export function periodTitle(period: StatsPeriod, anchor: Date): string {
  if (period === 'year') {
    return String(anchor.getFullYear());
  }
  if (period === 'month') {
    const label = anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const monday = new Date(anchor);
  // getDay() : 0 = dimanche. On ramène au lundi, comme le fait le serveur.
  const offset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset);
  return `Semaine du ${monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

/** Intitulé du graphique selon la maille renvoyée par le serveur. */
export function chartTitle(bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'day') return 'Distance par jour';
  if (bucket === 'month') return 'Distance par mois';
  return 'Distance par semaine';
}
