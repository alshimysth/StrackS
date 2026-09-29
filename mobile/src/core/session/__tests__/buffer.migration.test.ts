/**
 * Local migration of the SQLite buffer (#36, PR #80 review).
 *
 * An updated phone keeps its database: `CREATE TABLE IF NOT EXISTS` doesn't modify it.
 * This test reproduces a database created by the previous version (without `gps_mode`,
 * with a session in progress) and checks that the new version opens it, migrates it and
 * recovers the session.
 */
jest.mock('expo-sqlite', () => require('./support/expo-sqlite-mock').createExpoSqliteMock());

const T0 = Date.parse('2026-09-28T08:00:00Z');

beforeAll(async () => {
  const sqlite = require('expo-sqlite');
  const legacy = await sqlite.openDatabaseAsync('stracks-session.db');
  await legacy.execAsync(`
    CREATE TABLE session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      activity_id TEXT NOT NULL,
      sport_type TEXT NOT NULL,
      started_at_ms INTEGER NOT NULL,
      max_speed_kmh REAL NOT NULL,
      paused_total_s INTEGER NOT NULL DEFAULT 0,
      paused_at_ms INTEGER
    );
    INSERT INTO session VALUES (1, 'act-legacy', 'running', ${T0}, 25, 30, ${T0 + 60_000});
  `);
});

it('recovers a session written by the old version, in balanced mode', async () => {
  const buffer = require('../buffer');
  const session = await buffer.loadSession();
  expect(session).toEqual({
    activityId: 'act-legacy',
    sportType: 'running',
    startedAtMs: T0,
    maxSpeedKmh: 25,
    pausedTotalS: 30,
    pausedAtMs: T0 + 60_000,
  });
  expect(session.gpsMode).toBeUndefined(); // → the store resumes in "balanced"
});

it('writes the GPS mode in the added column', async () => {
  const buffer = require('../buffer');
  await buffer.saveSession({
    activityId: 'act-new',
    sportType: 'walking',
    startedAtMs: T0,
    maxSpeedKmh: 12,
    pausedTotalS: 0,
    pausedAtMs: null,
    gpsMode: 'saver',
  });
  expect(await buffer.loadSession()).toMatchObject({ activityId: 'act-new', gpsMode: 'saver' });
});

it('does not replay the migration on a second open', async () => {
  const sqlite = require('expo-sqlite');
  const db = await sqlite.openDatabaseAsync('stracks-session.db');
  const columns = await db.getAllAsync("SELECT name FROM pragma_table_info('session') WHERE name = 'gps_mode'");
  expect(columns).toHaveLength(1);
});
