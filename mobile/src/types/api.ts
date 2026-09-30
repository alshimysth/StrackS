/** DTOs shared with the Quarkus backend (camelCase JSON, ISO 8601 dates). */

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  /**
   * Address proven by a code (#75). Optional: a user cached by an earlier app version
   * lacks the field; absent means "not verified".
   */
  emailVerified?: boolean;
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
  /** Free-form title (#25). Null = title derived from the sport and date at display time. */
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

/** RFC 7807 error returned by the backend. */
export interface Problem {
  title: string;
  status: number;
  detail: string;
}

// ---------------------------------------------------------------------------
// Statistics (#24)
// ---------------------------------------------------------------------------

/**
 * Aggregates of one sport over a period.
 *
 * `totals` is open on purpose: the backend core names no sport metric, the plugin
 * declares its keys (`distanceM`, `elevationGainM`…). A sport without distance simply
 * declares none; the screen must therefore test a key's presence, never assume it's
 * there.
 */
export interface SportStats {
  sportType: string;
  label: string;
  sessions: number;
  totalDurationS: number;
  totals: Record<string, number>;
}

/** Totals of a window, all sports combined. */
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
  /** Same window shifted by one period: the basis of the comparison. */
  previous: StatsTotals;
}

/** Value of one sport within a chart interval (core columns only). */
export interface TimelineSportValue {
  sportType: string;
  sessions: number;
  durationS: number;
  distanceM: number;
}

export interface TimelineBucket {
  start: string;
  end: string;
  /** Empty when the interval has no session; the interval exists anyway. */
  bySport: TimelineSportValue[];
}

export interface StatsTimeline {
  from: string;
  to: string;
  bucket: 'day' | 'week' | 'month';
  buckets: TimelineBucket[];
}

/** Holder of a personal record (#61): the oldest session on a tie. */
export interface PersonalRecord {
  /** Key named by the sport module ("distanceM") or by the core ("durationS"). */
  key: string;
  /** Label written by the server ("Plus longue distance"). */
  label: string;
  /** SI unit of `value`: `m` or `s`. */
  unit: string;
  value: number;
  activityId: string;
  startedAt: string;
}

export interface SportRecords {
  sportType: string;
  label: string;
  sessions: number;
  records: PersonalRecord[];
}

export interface PersonalRecords {
  bySport: SportRecords[];
}

