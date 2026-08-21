/** DTOs partagés avec le backend Quarkus (JSON camelCase, dates ISO 8601). */

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface SportTypeDescriptor {
  code: string;
  label: string;
  usesGps: boolean;
  schemaVersion: number;
}

export type ActivityStatus = 'in_progress' | 'paused' | 'completed' | 'discarded';

export interface Activity {
  id: string;
  sportType: string;
  status: ActivityStatus;
  startedAt: string;
  endedAt: string | null;
  durationS: number | null;
  distanceM: number | null;
  calories: number | null;
  /** Titre libre (#25). Null = titre dérivé du sport et de la date à l'affichage. */
  title: string | null;
  notes: string | null;
  metrics: Record<string, unknown>;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

/** Erreur RFC 7807 renvoyée par le backend. */
export interface Problem {
  title: string;
  status: number;
  detail: string;
}

// ---------------------------------------------------------------------------
// Statistiques (#24)
// ---------------------------------------------------------------------------

/**
 * Agrégats d'un sport sur une période.
 *
 * `totals` est ouvert à dessein : le socle backend ne nomme aucune métrique de
 * sport, c'est le plugin qui déclare ses clés (`distanceM`, `elevationGainM`…).
 * Un sport sans distance n'en déclare simplement aucune — l'écran doit donc
 * tester la présence d'une clé, jamais supposer qu'elle est là.
 */
export interface SportStats {
  sportType: string;
  label: string;
  sessions: number;
  totalDurationS: number;
  totals: Record<string, number>;
}

/** Totaux d'une fenêtre, tous sports confondus. */
export interface StatsTotals {
  sessions: number;
  durationS: number;
  totals: Record<string, number>;
}

export interface StatsSummary {
  from: string;
  to: string;
  bySport: SportStats[];
  totalSessions: number;
  totalDurationS: number;
  totals: Record<string, number>;
  /** Même fenêtre décalée d'une période — la base de la comparaison. */
  previous: StatsTotals;
}

/** Valeur d'un sport dans un intervalle du graphique (colonnes du socle only). */
export interface TimelineSportValue {
  sportType: string;
  sessions: number;
  durationS: number;
  distanceM: number;
}

export interface TimelineBucket {
  start: string;
  end: string;
  /** Vide quand l'intervalle n'a aucune séance — l'intervalle existe quand même. */
  bySport: TimelineSportValue[];
}

export interface StatsTimeline {
  from: string;
  to: string;
  bucket: 'day' | 'week' | 'month';
  buckets: TimelineBucket[];
}
