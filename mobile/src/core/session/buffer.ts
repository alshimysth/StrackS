/**
 * Local crash-proof buffer (Epic 3), SQLite. Each GPS fix is persisted as soon as it
 * arrives: if the app is killed, the session and its track can be recovered on relaunch
 * (Epic 3 DoD). A single active session at a time (row id=1).
 */
import * as SQLite from 'expo-sqlite';

import type { GpsFix, GpsMode } from '../gps';

export interface BufferedSession {
  activityId: string;
  sportType: string;
  startedAtMs: number;
  maxSpeedKmh: number;
  pausedTotalS: number;
  pausedAtMs: number | null;
  /**
   * GPS mode of the session (#36), so that a session recovered after a kill resumes with
   * the same settings. Absent on a session written before it was added → `balanced`.
   */
  gpsMode?: GpsMode;
}

export interface BufferedPoint extends GpsFix {
  seq: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= SQLite.openDatabaseAsync('stracks-session.db').then(async (database) => {
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        activity_id TEXT NOT NULL,
        sport_type TEXT NOT NULL,
        started_at_ms INTEGER NOT NULL,
        max_speed_kmh REAL NOT NULL,
        paused_total_s INTEGER NOT NULL DEFAULT 0,
        paused_at_ms INTEGER
      );
      CREATE TABLE IF NOT EXISTS points (
        seq INTEGER PRIMARY KEY,
        recorded_at_ms INTEGER NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        altitude_m REAL,
        accuracy_m REAL,
        uploaded INTEGER NOT NULL DEFAULT 0
      );
    `);
    // Local migration (#36, PR #80 review): `CREATE TABLE IF NOT EXISTS` doesn't touch a
    // table already created by a previous app version. The column is added if missing,
    // nullable, so a session in progress at update time survives.
    const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(session)');
    if (!columns.some((column) => column.name === 'gps_mode')) {
      await database.execAsync('ALTER TABLE session ADD COLUMN gps_mode TEXT');
    }
    return database;
  });
  return dbPromise;
}

export async function saveSession(session: BufferedSession): Promise<void> {
  await (await db()).runAsync(
    `INSERT OR REPLACE INTO session (id, activity_id, sport_type, started_at_ms, max_speed_kmh, paused_total_s, paused_at_ms, gps_mode)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    session.activityId,
    session.sportType,
    session.startedAtMs,
    session.maxSpeedKmh,
    session.pausedTotalS,
    session.pausedAtMs,
    session.gpsMode ?? null,
  );
}

export async function loadSession(): Promise<BufferedSession | null> {
  const row = await (await db()).getFirstAsync<{
    activity_id: string;
    sport_type: string;
    started_at_ms: number;
    max_speed_kmh: number;
    paused_total_s: number;
    paused_at_ms: number | null;
    gps_mode: string | null;
  }>('SELECT * FROM session WHERE id = 1');
  if (row == null) {
    return null;
  }
  return {
    activityId: row.activity_id,
    sportType: row.sport_type,
    startedAtMs: row.started_at_ms,
    maxSpeedKmh: row.max_speed_kmh,
    pausedTotalS: row.paused_total_s,
    pausedAtMs: row.paused_at_ms,
    ...(isGpsMode(row.gps_mode) ? { gpsMode: row.gps_mode } : {}),
  };
}

/** Tolerant read: an unknown value (future version, corruption) counts as absent. */
function isGpsMode(value: string | null): value is GpsMode {
  return value === 'max' || value === 'balanced' || value === 'saver';
}

export async function updatePauseState(pausedTotalS: number, pausedAtMs: number | null): Promise<void> {
  await (await db()).runAsync(
    'UPDATE session SET paused_total_s = ?, paused_at_ms = ? WHERE id = 1',
    pausedTotalS,
    pausedAtMs,
  );
}

export async function appendPoint(seq: number, fix: GpsFix): Promise<void> {
  await (await db()).runAsync(
    `INSERT OR IGNORE INTO points (seq, recorded_at_ms, lat, lng, altitude_m, accuracy_m)
     VALUES (?, ?, ?, ?, ?, ?)`,
    seq,
    fix.recordedAtMs,
    fix.lat,
    fix.lng,
    fix.altitudeM,
    fix.accuracyM,
  );
}

/**
 * Next free sequence number, read from the buffer (#16).
 *
 * The background location task lives in a separate JS context, created and destroyed at
 * the system's whim: it can't rely on an in-memory counter. Since `seq` is the primary key
 * of `points`, starting again from the maximum guarantees nothing is overwritten, and
 * `appendPoint`'s `INSERT OR IGNORE` absorbs a possible race between foreground and
 * background.
 */
export async function nextSeqAfterBuffer(): Promise<number> {
  const row = await (await db()).getFirstAsync<{ maxSeq: number | null }>(
    'SELECT MAX(seq) AS maxSeq FROM points',
  );
  return (row?.maxSeq ?? -1) + 1;
}

function toPoint(row: {
  seq: number;
  recorded_at_ms: number;
  lat: number;
  lng: number;
  altitude_m: number | null;
  accuracy_m: number | null;
}): BufferedPoint {
  return {
    seq: row.seq,
    recordedAtMs: row.recorded_at_ms,
    lat: row.lat,
    lng: row.lng,
    altitudeM: row.altitude_m,
    accuracyM: row.accuracy_m,
  };
}

/** Points not yet acknowledged by the server, in sequence order. */
export async function pendingPoints(limit: number): Promise<BufferedPoint[]> {
  const rows = await (await db()).getAllAsync<Parameters<typeof toPoint>[0]>(
    'SELECT * FROM points WHERE uploaded = 0 ORDER BY seq LIMIT ?',
    limit,
  );
  return rows.map(toPoint);
}

export async function markUploaded(seqs: number[]): Promise<void> {
  if (seqs.length === 0) {
    return;
  }
  await (await db()).runAsync(
    `UPDATE points SET uploaded = 1 WHERE seq IN (${seqs.map(() => '?').join(',')})`,
    ...seqs,
  );
}

/** Full track (recovery after a kill). */
export async function allPoints(): Promise<BufferedPoint[]> {
  const rows = await (await db()).getAllAsync<Parameters<typeof toPoint>[0]>(
    'SELECT * FROM points ORDER BY seq',
  );
  return rows.map(toPoint);
}

export async function clearBuffer(): Promise<void> {
  await (await db()).execAsync('DELETE FROM session; DELETE FROM points;');
}
