/**
 * Migration locale du buffer SQLite (#36, revue PR #80).
 *
 * Un téléphone mis à jour garde sa base : `CREATE TABLE IF NOT EXISTS` ne la modifie pas.
 * Ce test reproduit une base créée par la version précédente — sans `gps_mode`, avec une
 * séance en cours — et vérifie que la nouvelle version l'ouvre, la migre et récupère
 * la séance.
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

it('récupère une séance écrite par l’ancienne version, en mode équilibré', async () => {
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
  expect(session.gpsMode).toBeUndefined(); // → le store reprend en « balanced »
});

it('écrit le mode GPS dans la colonne ajoutée', async () => {
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

it('ne rejoue pas la migration à une seconde ouverture', async () => {
  const sqlite = require('expo-sqlite');
  const db = await sqlite.openDatabaseAsync('stracks-session.db');
  const columns = await db.getAllAsync("SELECT name FROM pragma_table_info('session') WHERE name = 'gps_mode'");
  expect(columns).toHaveLength(1);
});
