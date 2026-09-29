/**
 * Crash-proof session buffer (#40).
 *
 * It's the piece carrying the PRD's "zero session loss" guarantee: each GPS fix is
 * persisted as soon as it arrives, and the track must survive a killed app and then an
 * upload replay. Both implementations of the contract (SQLite on mobile, memory on web)
 * go through the same suite.
 *
 * The expo-sqlite mock is backed by a real SQLite engine: buffer.ts's own queries are
 * what gets executed (see support/expo-sqlite-mock.ts).
 */
import type { GpsFix } from '../../gps';
import * as webBuffer from '../buffer.web';

jest.mock('expo-sqlite', () =>
  require('./support/expo-sqlite-mock').createExpoSqliteMock(),
);

// Imported after the mock: buffer.ts opens its database on the first query.
import * as sqliteBuffer from '../buffer';

type BufferModule = typeof sqliteBuffer;

const T0 = Date.parse('2026-08-11T08:00:00Z');

function point(seq: number, overrides: Partial<GpsFix> = {}): GpsFix & { seq: number } {
  return {
    seq,
    recordedAtMs: T0 + seq * 1000,
    lat: 45.0 + seq * 0.0001,
    lng: 5.0,
    altitudeM: 200 + seq,
    accuracyM: 5,
    ...overrides,
  };
}

const session = {
  activityId: '11111111-2222-3333-4444-555555555555',
  sportType: 'running',
  startedAtMs: T0,
  maxSpeedKmh: 25,
  pausedTotalS: 0,
  pausedAtMs: null,
  gpsMode: 'saver' as const,
};

const implementations: [string, BufferModule][] = [
  ['buffer.ts — SQLite (mobile)', sqliteBuffer],
  ['buffer.web.ts — mémoire (web)', webBuffer],
];

describe.each(implementations)('buffer contract: %s', (_label, buffer) => {
  beforeEach(async () => {
    await buffer.clearBuffer();
  });

  describe('session', () => {
    it('round-trips every field', async () => {
      await buffer.saveSession(session);
      expect(await buffer.loadSession()).toEqual(session);
    });

    it('returns no session when the buffer is empty', async () => {
      expect(await buffer.loadSession()).toBeNull();
    });

    it('keeps a single session: the last one written overwrites the previous one', async () => {
      await buffer.saveSession(session);
      await buffer.saveSession({ ...session, activityId: 'autre', sportType: 'walking' });
      const loaded = await buffer.loadSession();
      expect(loaded).toMatchObject({ activityId: 'autre', sportType: 'walking' });
    });

    it('updates the pause state without touching the rest', async () => {
      await buffer.saveSession(session);
      await buffer.updatePauseState(42, T0 + 60_000);
      expect(await buffer.loadSession()).toEqual({
        ...session,
        pausedTotalS: 42,
        pausedAtMs: T0 + 60_000,
      });
    });

    it('can come back from a pause (pausedAtMs reset to null)', async () => {
      await buffer.saveSession(session);
      await buffer.updatePauseState(42, T0 + 60_000);
      await buffer.updatePauseState(99, null);
      expect(await buffer.loadSession()).toMatchObject({ pausedTotalS: 99, pausedAtMs: null });
    });

    it('does not break when no session is open', async () => {
      await expect(buffer.updatePauseState(10, null)).resolves.toBeUndefined();
      expect(await buffer.loadSession()).toBeNull();
    });
  });

  describe('track points', () => {
    it('returns the points in seq order', async () => {
      for (const seq of [0, 1, 2]) {
        await buffer.appendPoint(seq, point(seq));
      }
      expect((await buffer.allPoints()).map((p) => p.seq)).toEqual([0, 1, 2]);
    });

    /**
     * Write idempotency (#52): SQLite does `INSERT OR IGNORE`, the first value wins. A
     * replay (background task and foreground writing the same seq) must neither duplicate
     * nor overwrite a point.
     */
    it('ignores an already written seq and keeps the first value', async () => {
      await buffer.appendPoint(0, point(0, { lat: 45.0 }));
      await buffer.appendPoint(0, point(0, { lat: 46.0 }));
      const stored = await buffer.allPoints();
      expect(stored).toHaveLength(1);
      expect(stored[0].lat).toBeCloseTo(45.0, 10);
    });

    it('sorts by seq even when points arrive out of order', async () => {
      for (const seq of [2, 0, 1]) {
        await buffer.appendPoint(seq, point(seq));
      }
      expect((await buffer.allPoints()).map((p) => p.seq)).toEqual([0, 1, 2]);
    });

    it('also sorts the upload queue by seq', async () => {
      for (const seq of [3, 1, 2, 0]) {
        await buffer.appendPoint(seq, point(seq));
      }
      expect((await buffer.pendingPoints(3)).map((p) => p.seq)).toEqual([0, 1, 2]);
    });

    it('resumes numbering after the highest written seq', async () => {
      expect(await buffer.nextSeqAfterBuffer()).toBe(0);
      for (const seq of [4, 1]) {
        await buffer.appendPoint(seq, point(seq));
      }
      expect(await buffer.nextSeqAfterBuffer()).toBe(5);
    });

    it('keeps missing altitude and accuracy as null', async () => {
      await buffer.appendPoint(0, point(0, { altitudeM: null, accuracyM: null }));
      const [stored] = await buffer.allPoints();
      expect(stored.altitudeM).toBeNull();
      expect(stored.accuracyM).toBeNull();
      expect(stored.lat).toBeCloseTo(45.0, 10);
    });

    it('returns the whole track, acknowledged or not (recovery after a kill)', async () => {
      for (let seq = 0; seq < 5; seq++) {
        await buffer.appendPoint(seq, point(seq));
      }
      await buffer.markUploaded([0, 1, 2]);
      expect(await buffer.allPoints()).toHaveLength(5);
    });
  });

  describe('upload queue', () => {
    beforeEach(async () => {
      for (let seq = 0; seq < 10; seq++) {
        await buffer.appendPoint(seq, point(seq));
      }
    });

    it('only returns points not yet acknowledged, in seq order', async () => {
      await buffer.markUploaded([0, 1, 2, 3]);
      expect((await buffer.pendingPoints(100)).map((p) => p.seq)).toEqual([4, 5, 6, 7, 8, 9]);
    });

    it('respects the requested batch size', async () => {
      expect(await buffer.pendingPoints(3)).toHaveLength(3);
      expect((await buffer.pendingPoints(3)).map((p) => p.seq)).toEqual([0, 1, 2]);
    });

    it('returns an empty queue when everything is acknowledged', async () => {
      await buffer.markUploaded([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(await buffer.pendingPoints(100)).toEqual([]);
    });

    it('accepts an empty acknowledgement without complaint', async () => {
      await expect(buffer.markUploaded([])).resolves.toBeUndefined();
      expect(await buffer.pendingPoints(100)).toHaveLength(10);
    });

    it('acknowledges an unknown seq without side effect', async () => {
      await buffer.markUploaded([999]);
      expect(await buffer.pendingPoints(100)).toHaveLength(10);
    });

    it('is idempotent: acknowledging the same points again changes nothing', async () => {
      await buffer.markUploaded([0, 1]);
      await buffer.markUploaded([0, 1]);
      expect((await buffer.pendingPoints(100)).map((p) => p.seq)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe('purge', () => {
    it('clears session and points at once', async () => {
      await buffer.saveSession(session);
      await buffer.appendPoint(0, point(0));
      await buffer.clearBuffer();
      expect(await buffer.loadSession()).toBeNull();
      expect(await buffer.allPoints()).toEqual([]);
    });

    it('can be replayed on an already empty buffer', async () => {
      await expect(buffer.clearBuffer()).resolves.toBeUndefined();
      await expect(buffer.clearBuffer()).resolves.toBeUndefined();
    });
  });
});
