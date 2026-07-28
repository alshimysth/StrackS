/**
 * Buffer local anti-crash (Epic 3) — SQLite. Chaque fix GPS est persisté dès
 * réception : si l'app est tuée, la séance et son tracé sont récupérables au
 * relancement (DoD Epic 3). Une seule séance active à la fois (ligne id=1).
 */
import * as SQLite from 'expo-sqlite';

import type { GpsFix } from '../gps';

export interface BufferedSession {
  activityId: string;
  sportType: string;
  startedAtMs: number;
  maxSpeedKmh: number;
  pausedTotalS: number;
  pausedAtMs: number | null;
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
    return database;
  });
  return dbPromise;
}

export async function saveSession(session: BufferedSession): Promise<void> {
  await (await db()).runAsync(
    `INSERT OR REPLACE INTO session (id, activity_id, sport_type, started_at_ms, max_speed_kmh, paused_total_s, paused_at_ms)
     VALUES (1, ?, ?, ?, ?, ?, ?)`,
    session.activityId,
    session.sportType,
    session.startedAtMs,
    session.maxSpeedKmh,
    session.pausedTotalS,
    session.pausedAtMs,
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
  };
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

/** Points pas encore acquittés par le serveur, par ordre de séquence. */
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

/** Tracé complet (récupération après kill). */
export async function allPoints(): Promise<BufferedPoint[]> {
  const rows = await (await db()).getAllAsync<Parameters<typeof toPoint>[0]>(
    'SELECT * FROM points ORDER BY seq',
  );
  return rows.map(toPoint);
}

export async function clearBuffer(): Promise<void> {
  await (await db()).execAsync('DELETE FROM session; DELETE FROM points;');
}
