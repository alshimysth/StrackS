/**
 * Session engine state machine (#40): idle → starting → active ⇄ paused → stopping.
 *
 * What's checked here are Epic 3's guarantees: a session never half starts, pause time
 * doesn't count in the duration, an upload failure leaves the session recoverable
 * instead of losing it, and a killed app catches up from the buffer.
 *
 * The buffer is replaced by the in-memory implementation (`buffer.web.ts`): same
 * contract, but its real state can be queried rather than mocked calls. `metrics.ts`
 * stays the real engine, so the metrics replayed on recovery are compared with the
 * backend parity fixtures.
 */
import type { Activity } from '../../../types/api';
import type { GpsFix } from '../../gps';
import { DEG_PER_M, JAVA_GOLDEN, cleanTrack } from './support/gps-fixtures';

jest.mock('../buffer', () => require('../buffer.web'));

jest.mock('../uploader', () => ({
  flushTrackPoints: jest.fn(),
}));

jest.mock('../../api/activities', () => ({
  startActivity: jest.fn(),
  pauseActivity: jest.fn(),
  resumeActivity: jest.fn(),
  stopActivity: jest.fn(),
  deleteActivity: jest.fn(),
}));

// The real client pulls in AsyncStorage persistence: only the invalidation matters here (#69).
jest.mock('../../api/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../gps', () => ({
  startGpsWatch: jest.fn(),
  // Added by #16: the engine always calls them (start and stop). `startBackgroundUpdates`
  // returns false by default: it's the degraded case, the one that must keep working
  // without the "always" permission.
  startBackgroundUpdates: jest.fn().mockResolvedValue(false),
  stopBackgroundUpdates: jest.fn().mockResolvedValue(undefined),
}));

const T0 = Date.parse('2026-08-11T08:00:00Z');
const ACTIVITY_ID = '11111111-2222-3333-4444-555555555555';

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: ACTIVITY_ID,
    sportType: 'running',
    status: 'in_progress',
    startedAt: new Date(T0).toISOString(),
    endedAt: null,
    durationS: null,
    distanceM: null,
    calories: null,
    title: null,
    notes: null,
    metrics: {},
    ...overrides,
  };
}

// Modules required again for each test: the store keeps its engine state (GPS, timers,
// seq counter) in module variables.
type Store = typeof import('../use-session-store').useSessionStore;
type Api = jest.Mocked<typeof import('../../api/activities')>;
type Gps = jest.Mocked<typeof import('../../gps')>;
type Uploader = jest.Mocked<typeof import('../uploader')>;
type Buffer = typeof import('../buffer.web');
type Queries = { queryClient: { invalidateQueries: jest.Mock } };

let useSessionStore: Store;
let api: Api;
let gps: Gps;
let uploader: Uploader;
let buffer: Buffer;
let queries: Queries;
let removeWatch: jest.Mock;

/** Lets unawaited promises run (appendPoint, best-effort API). */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
  }
}

/**
 * Advances time by `ms`: the clock AND the timers, together. `jest.advanceTimersByTime`
 * also moves `Date.now()`; mixing a `setSystemTime` with an `advanceTimersByTime` shifts
 * the timer by a tick. Time in these tests is therefore driven only by this function,
 * starting from T0.
 */
async function advance(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await settle();
}

/** Simulates a GPS fix arriving through the current watch. */
async function emitFix(fix: GpsFix): Promise<void> {
  const calls = gps.startGpsWatch.mock.calls;
  const onFix = calls[calls.length - 1][0];
  onFix(fix);
  await settle();
}

async function startSession(): Promise<void> {
  api.startActivity.mockResolvedValue(activity());
  await useSessionStore.getState().start('running', 25);
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.setSystemTime(T0);

  useSessionStore = require('../use-session-store').useSessionStore;
  api = require('../../api/activities');
  gps = require('../../gps');
  uploader = require('../uploader');
  buffer = require('../buffer.web');
  queries = require('../../api/query-client');

  removeWatch = jest.fn();
  gps.startGpsWatch.mockResolvedValue({ remove: removeWatch });
  uploader.flushTrackPoints.mockResolvedValue(true);
  api.stopActivity.mockResolvedValue(activity({ status: 'completed', durationS: 0 }));
  api.pauseActivity.mockResolvedValue(activity({ status: 'paused' }));
  api.resumeActivity.mockResolvedValue(activity());
  api.deleteActivity.mockResolvedValue(undefined);
});

afterEach(async () => {
  await buffer.clearBuffer();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('start', () => {
  it('goes from idle to active and arms the whole engine', async () => {
    await startSession();

    const state = useSessionStore.getState();
    expect(state.status).toBe('active');
    expect(state.activityId).toBe(ACTIVITY_ID);
    expect(state.sportType).toBe('running');
    expect(state.live).toEqual({
      elapsedS: 0,
      distanceM: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      smoothedSpeedMs: 0,
    });
    expect(gps.startGpsWatch).toHaveBeenCalledTimes(1);
    expect(api.startActivity).toHaveBeenCalledWith('running');
  });

  it('persists the session in the buffer before the first fix', async () => {
    await startSession();

    expect(await buffer.loadSession()).toEqual({
      activityId: ACTIVITY_ID,
      sportType: 'running',
      startedAtMs: T0,
      maxSpeedKmh: 25,
      pausedTotalS: 0,
      pausedAtMs: null,
      gpsMode: 'balanced',
    });
  });

  it('refuses to start a second session', async () => {
    await startSession();
    await expect(useSessionStore.getState().start('walking', 10)).rejects.toThrow(
      'Une séance est déjà en cours.',
    );
    expect(useSessionStore.getState().sportType).toBe('running');
    expect(api.startActivity).toHaveBeenCalledTimes(1);
  });

  it('cancels the server activity if the GPS is refused (no ghost session)', async () => {
    api.startActivity.mockResolvedValue(activity());
    gps.startGpsWatch.mockRejectedValue(new Error('Permission de localisation refusée'));

    await expect(useSessionStore.getState().start('running', 25)).rejects.toThrow(
      'Permission de localisation refusée',
    );
    await settle();

    expect(api.deleteActivity).toHaveBeenCalledWith(ACTIVITY_ID);
    expect(useSessionStore.getState().status).toBe('idle');
    expect(useSessionStore.getState().activityId).toBeNull();
  });

  it('stays idle if the server refuses to create the activity', async () => {
    api.startActivity.mockRejectedValue(new Error('Erreur réseau'));

    await expect(useSessionStore.getState().start('running', 25)).rejects.toThrow('Erreur réseau');
    expect(useSessionStore.getState().status).toBe('idle');
    expect(api.deleteActivity).not.toHaveBeenCalled();
  });
});

describe('GPS fixes during an active session', () => {
  it('persists each fix and publishes the live metrics', async () => {
    await startSession();
    await emitFix(cleanTrack[0]);
    await emitFix(cleanTrack[1]);

    expect((await buffer.allPoints()).map((p) => p.seq)).toEqual([0, 1]);
    expect(useSessionStore.getState().live.distanceM).toBeCloseTo(
      JAVA_GOLDEN.haversineOneStepM,
      3,
    );
    expect(useSessionStore.getState().path).toHaveLength(2);
  });

  it('persists even a fix dropped by the filters (the server will decide)', async () => {
    await startSession();
    await emitFix(cleanTrack[0]);
    await emitFix({ ...cleanTrack[1], accuracyM: 120 });

    // Two points in the database, only one in the displayed track.
    expect(await buffer.allPoints()).toHaveLength(2);
    expect(useSessionStore.getState().path).toHaveLength(1);
    expect(useSessionStore.getState().live.distanceM).toBe(0);
    expect(useSessionStore.getState().gpsAccuracyM).toBe(120);
  });

  it('ignores fixes arriving outside the active state', async () => {
    await startSession();
    await useSessionStore.getState().pause();
    await emitFix(cleanTrack[0]);

    expect(await buffer.allPoints()).toHaveLength(0);
  });

  it('drops the speed back to zero after 5 s without a fix', async () => {
    await startSession();
    await emitFix({ ...cleanTrack[0], recordedAtMs: T0 });
    // 20 m in 4 s = 5 m/s: plausible when running, so accepted.
    await emitFix({ ...cleanTrack[0], lat: 45.0 + 20 * DEG_PER_M, recordedAtMs: T0 + 4000 });

    await advance(5000); // last fix 1 s ago: the speed shows
    expect(useSessionStore.getState().live.smoothedSpeedMs).toBeCloseTo(5, 1);

    await advance(10_000); // nothing for 11 s: signal lost
    expect(useSessionStore.getState().live.smoothedSpeedMs).toBe(0);
  });

  it('pushes the buffer to the server every 10 s', async () => {
    await startSession();
    await advance(30_000);
    expect(uploader.flushTrackPoints).toHaveBeenCalledTimes(3);
    expect(uploader.flushTrackPoints).toHaveBeenCalledWith(ACTIVITY_ID);
  });
});

describe('pause / resume', () => {
  it('freezes the timer and cuts the GPS on pause', async () => {
    await startSession();
    await advance(10_000);

    await useSessionStore.getState().pause();

    expect(useSessionStore.getState().status).toBe('paused');
    expect(useSessionStore.getState().live.elapsedS).toBe(10);
    expect(useSessionStore.getState().live.smoothedSpeedMs).toBe(0);
    expect(removeWatch).toHaveBeenCalledTimes(1);

    // The timer no longer moves, even 60 s later.
    await advance(60_000);
    expect(useSessionStore.getState().live.elapsedS).toBe(10);
  });

  it('writes the pause to the buffer to survive a kill', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();

    expect(await buffer.loadSession()).toMatchObject({
      pausedTotalS: 0,
      pausedAtMs: T0 + 10_000,
    });
  });

  it('excludes pause time from the elapsed duration', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();

    await advance(30_000); // 30 s of pause
    await useSessionStore.getState().resume();
    expect(useSessionStore.getState().status).toBe('active');

    await advance(5000);
    expect(useSessionStore.getState().live.elapsedS).toBe(15); // 45 s - 30 s
    expect(await buffer.loadSession()).toMatchObject({ pausedTotalS: 30, pausedAtMs: null });
  });

  it('adds up several pauses', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();
    await advance(10_000);
    await useSessionStore.getState().resume();
    await advance(10_000);
    await useSessionStore.getState().pause();
    await advance(20_000);
    await useSessionStore.getState().resume();

    expect(await buffer.loadSession()).toMatchObject({ pausedTotalS: 30 });
    await advance(10_000);
    expect(useSessionStore.getState().live.elapsedS).toBe(30); // 60 s - 30 s
  });

  it('restarts the GPS on resume', async () => {
    await startSession();
    await useSessionStore.getState().pause();
    await useSessionStore.getState().resume();
    expect(gps.startGpsWatch).toHaveBeenCalledTimes(2);
  });

  it('does nothing when pausing outside the active state', async () => {
    await useSessionStore.getState().pause();
    expect(useSessionStore.getState().status).toBe('idle');
    expect(api.pauseActivity).not.toHaveBeenCalled();
  });

  it('does nothing when resuming outside the paused state', async () => {
    await startSession();
    await useSessionStore.getState().resume();
    expect(api.resumeActivity).not.toHaveBeenCalled();
  });

  it('tolerates an unreachable server (best-effort pause/resume)', async () => {
    await startSession();
    api.pauseActivity.mockRejectedValue(new Error('Erreur réseau'));
    api.resumeActivity.mockRejectedValue(new Error('Erreur réseau'));

    await expect(useSessionStore.getState().pause()).resolves.toBeUndefined();
    expect(useSessionStore.getState().status).toBe('paused');
    await expect(useSessionStore.getState().resume()).resolves.toBeUndefined();
    expect(useSessionStore.getState().status).toBe('active');
    await settle();
  });
});

describe('stop', () => {
  it('sends the track, closes on the server and goes back to idle', async () => {
    await startSession();
    await advance(60_000);

    const completed = await useSessionStore.getState().stop();

    expect(uploader.flushTrackPoints).toHaveBeenCalledWith(ACTIVITY_ID);
    expect(api.stopActivity).toHaveBeenCalledWith(ACTIVITY_ID, {
      endedAt: new Date(T0 + 60_000).toISOString(),
      durationS: 60,
    });
    expect(completed.status).toBe('completed');
    expect(useSessionStore.getState().status).toBe('idle');
    expect(useSessionStore.getState().activityId).toBeNull();
    expect(await buffer.loadSession()).toBeNull();
    expect(await buffer.allPoints()).toEqual([]);
  });

  it('deducts pause time from the sent duration', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();
    await advance(30_000);
    await useSessionStore.getState().resume();
    await advance(30_000);

    await useSessionStore.getState().stop();
    expect(api.stopActivity).toHaveBeenCalledWith(
      ACTIVITY_ID,
      expect.objectContaining({ durationS: 40 }), // 70 s - 30 s de pause
    );
  });

  it('can close from the paused state, freezing the end at the pause instant', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();
    await advance(80_000);

    await useSessionStore.getState().stop();
    expect(api.stopActivity).toHaveBeenCalledWith(ACTIVITY_ID, {
      endedAt: new Date(T0 + 10_000).toISOString(),
      durationS: 10,
    });
  });

  /**
   * #69: the summary reads the week's totals from a cache shared with the home screen.
   * Without invalidation, it concludes on totals from before the session.
   */
  it('invalidates stats and history once the session is closed', async () => {
    await startSession();
    await advance(20_000); // shorter than the 30 s staleTime: nothing else would refresh

    await useSessionStore.getState().stop();

    const keys = queries.queryClient.invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(keys).toEqual(expect.arrayContaining([['stats'], ['activities']]));
  });

  it('invalidates nothing when closing fails, since the session did not change the totals', async () => {
    await startSession();
    uploader.flushTrackPoints.mockResolvedValue(false);

    await expect(useSessionStore.getState().stop()).rejects.toThrow(/Tracé GPS/);

    expect(queries.queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('refuses to close without a session', async () => {
    await expect(useSessionStore.getState().stop()).rejects.toThrow('Aucune séance en cours.');
  });

  it('keeps the session recoverable if the track could not be sent', async () => {
    await startSession();
    await emitFix(cleanTrack[0]);
    uploader.flushTrackPoints.mockResolvedValue(false);
    await advance(60_000);

    await expect(useSessionStore.getState().stop()).rejects.toThrow(
      'Tracé GPS pas encore envoyé — vérifie ta connexion puis réessaie.',
    );

    expect(useSessionStore.getState().status).toBe('paused');
    expect(useSessionStore.getState().activityId).toBe(ACTIVITY_ID);
    expect(api.stopActivity).not.toHaveBeenCalled();
    // Nothing is purged: the track and the session stay in the database.
    expect(await buffer.loadSession()).toMatchObject({ pausedAtMs: T0 + 60_000 });
    expect(await buffer.allPoints()).toHaveLength(1);
  });

  it('succeeds on the second attempt, network back', async () => {
    await startSession();
    uploader.flushTrackPoints.mockResolvedValueOnce(false);
    await expect(useSessionStore.getState().stop()).rejects.toThrow(/Tracé GPS/);

    uploader.flushTrackPoints.mockResolvedValue(true);
    await expect(useSessionStore.getState().stop()).resolves.toMatchObject({
      status: 'completed',
    });
    expect(useSessionStore.getState().status).toBe('idle');
  });

  it('purges local data when the activity no longer exists on the server (404)', async () => {
    const { ApiError } = require('../../api/client');
    await startSession();
    await emitFix(cleanTrack[0]);
    api.stopActivity.mockRejectedValue(
      new ApiError({ title: 'Not Found', status: 404, detail: 'Activité introuvable' }),
    );

    await expect(useSessionStore.getState().stop()).rejects.toThrow(
      'Séance introuvable côté serveur — données locales purgées.',
    );
    await settle();

    expect(useSessionStore.getState().status).toBe('idle');
    expect(await buffer.loadSession()).toBeNull();
    expect(await buffer.allPoints()).toEqual([]);
  });
});

describe('recover: app killed mid-session', () => {
  /** Writes an orphan session to the buffer, as a kill would have left it. */
  async function orphanSession(points: GpsFix[], pausedAtMs: number | null = null) {
    await buffer.saveSession({
      activityId: ACTIVITY_ID,
      sportType: 'running',
      startedAtMs: T0,
      maxSpeedKmh: 25,
      pausedTotalS: 0,
      pausedAtMs,
    });
    for (let seq = 0; seq < points.length; seq++) {
      await buffer.appendPoint(seq, points[seq]);
    }
  }

  it('recovers nothing when the buffer is empty', async () => {
    await expect(useSessionStore.getState().recover()).resolves.toBe(false);
    expect(useSessionStore.getState().status).toBe('idle');
  });

  it('recovers nothing if a session is already running', async () => {
    await startSession();
    await expect(useSessionStore.getState().recover()).resolves.toBe(false);
  });

  it('resumes the session paused and replays the track metrics', async () => {
    await orphanSession(cleanTrack);

    await expect(useSessionStore.getState().recover()).resolves.toBe(true);

    const state = useSessionStore.getState();
    expect(state.status).toBe('paused');
    expect(state.activityId).toBe(ACTIVITY_ID);
    expect(state.sportType).toBe('running');
    expect(state.path).toHaveLength(100);
    // The replay goes through the real engine: same metrics as the backend.
    expect(state.live.distanceM).toBeCloseTo(JAVA_GOLDEN.cleanTrackDistanceM, 3);
  });

  it('counts dead time as a pause, bounded by the last known point', async () => {
    await orphanSession(cleanTrack);
    const lastFixMs = cleanTrack[99].recordedAtMs;

    await useSessionStore.getState().recover();

    expect(await buffer.loadSession()).toMatchObject({ pausedAtMs: lastFixMs });
    // The timer is frozen at the last point's instant, not at now.
    expect(useSessionStore.getState().live.elapsedS).toBe(
      Math.round((lastFixMs - T0) / 1000),
    );
  });

  it('respects an explicit pause already recorded', async () => {
    await orphanSession(cleanTrack, T0 + 5000);
    await useSessionStore.getState().recover();
    expect(await buffer.loadSession()).toMatchObject({ pausedAtMs: T0 + 5000 });
    expect(useSessionStore.getState().live.elapsedS).toBe(5);
  });

  it('resumes point numbering after the last known seq', async () => {
    await orphanSession(cleanTrack);
    await useSessionStore.getState().recover();

    await advance(cleanTrack[99].recordedAtMs - T0);
    await useSessionStore.getState().resume();
    await emitFix({ ...cleanTrack[99], recordedAtMs: cleanTrack[99].recordedAtMs + 1000 });

    const seqs = (await buffer.allPoints()).map((p) => p.seq);
    expect(seqs).toHaveLength(101);
    expect(seqs[100]).toBe(100); // no collision with the replayed seqs
  });

  it('recovers a session without any point (kill right after start)', async () => {
    await orphanSession([]);
    await expect(useSessionStore.getState().recover()).resolves.toBe(true);
    expect(useSessionStore.getState().status).toBe('paused');
    expect(useSessionStore.getState().path).toEqual([]);
  });

  it('can directly close a recovered session', async () => {
    await orphanSession(cleanTrack);
    await useSessionStore.getState().recover();

    await expect(useSessionStore.getState().stop()).resolves.toMatchObject({
      status: 'completed',
    });
    expect(useSessionStore.getState().status).toBe('idle');
  });
});

/**
 * Regression tests for #51. `resume()` used to write `updatePauseState(pausedTotalS, null)`
 * BEFORE awaiting `startGpsWatch()`. When the watch was refused (location permission
 * revoked mid-session), the promise rejected and the status stayed `paused`, but
 * `pausedAtMs` was already reset to null. `stop()` then took `pausedAtMs ?? Date.now()`,
 * and all the time elapsed since the failed resume was billed as effort time.
 *
 * `resume()` now obtains the GPS watch before touching the pause.
 */
describe('resume refused by the GPS', () => {
  it('leaves the session paused', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();

    gps.startGpsWatch.mockRejectedValue(new Error('Permission de localisation refusée'));
    await advance(10_000);
    await expect(useSessionStore.getState().resume()).rejects.toThrow(/Permission/);

    expect(useSessionStore.getState().status).toBe('paused');
  });

  it('does not alter the displayed duration', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();
    expect(useSessionStore.getState().live.elapsedS).toBe(10);

    gps.startGpsWatch.mockRejectedValue(new Error('Permission de localisation refusée'));
    await advance(10_000);
    await expect(useSessionStore.getState().resume()).rejects.toThrow(/Permission/);

    await advance(60_000);
    expect(useSessionStore.getState().live.elapsedS).toBe(10);
  });

  it('closes on the real effort duration, not on the end time', async () => {
    await startSession();
    await advance(10_000); // 10 s of effort
    await useSessionStore.getState().pause();

    gps.startGpsWatch.mockRejectedValue(new Error('Permission de localisation refusée'));
    await advance(10_000);
    await expect(useSessionStore.getState().resume()).rejects.toThrow(/Permission/);

    // 60 s more at the stop, still paused, then close.
    await advance(60_000);
    gps.startGpsWatch.mockResolvedValue({ remove: removeWatch });
    await useSessionStore.getState().stop();

    expect(api.stopActivity).toHaveBeenCalledWith(
      ACTIVITY_ID,
      expect.objectContaining({ durationS: 10 }),
    );
  });

  /**
   * A failed resume doesn't credit a pause: the next, successful resume closes the pause,
   * and counts it in full.
   */
  it('counts the whole pause when a resume succeeds after a refusal', async () => {
    await startSession();
    await advance(10_000); // 10 s of effort
    await useSessionStore.getState().pause();

    gps.startGpsWatch.mockRejectedValue(new Error('Permission de localisation refusée'));
    await advance(10_000);
    await expect(useSessionStore.getState().resume()).rejects.toThrow(/Permission/);

    await advance(50_000); // permission restored in the settings, back in the app
    gps.startGpsWatch.mockResolvedValue({ remove: removeWatch });
    await useSessionStore.getState().resume();
    expect(useSessionStore.getState().status).toBe('active');
    expect(await buffer.loadSession()).toMatchObject({ pausedTotalS: 60, pausedAtMs: null });

    await advance(15_000); // 15 s of effort after the resume
    await useSessionStore.getState().stop();

    expect(api.stopActivity).toHaveBeenCalledWith(
      ACTIVITY_ID,
      expect.objectContaining({ durationS: 25 }),
    );
  });

  it('does not touch the buffer when the resume is refused', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();

    gps.startGpsWatch.mockRejectedValue(new Error('Permission de localisation refusée'));
    await advance(10_000);
    await expect(useSessionStore.getState().resume()).rejects.toThrow(/Permission/);

    // An app killed now must recover as a bounded pause, not as an open session.
    expect(await buffer.loadSession()).toMatchObject({ pausedTotalS: 0, pausedAtMs: T0 + 10_000 });
  });
});

/** Issues raised by the CodeRabbit review of PR #71. */
describe('races between resume, close and local purge', () => {
  it('does not restart a session closed while the GPS is being obtained', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();

    let grant: (sub: { remove: jest.Mock }) => void = () => undefined;
    gps.startGpsWatch.mockReturnValueOnce(new Promise((resolve) => (grant = resolve)));
    const resuming = useSessionStore.getState().resume();
    await settle();

    await useSessionStore.getState().stop(); // close while the GPS keeps us waiting
    const lateWatch = { remove: jest.fn() };
    grant(lateWatch);
    await resuming;

    expect(useSessionStore.getState().status).toBe('idle');
    expect(lateWatch.remove).toHaveBeenCalled();
    expect(api.resumeActivity).not.toHaveBeenCalled();
  });

  it('installs a single watch when the resume is requested twice', async () => {
    await startSession();
    await useSessionStore.getState().pause();
    gps.startGpsWatch.mockClear();

    await Promise.all([useSessionStore.getState().resume(), useSessionStore.getState().resume()]);

    expect(gps.startGpsWatch).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().status).toBe('active');
  });

  /**
   * The server closed the session: a failed local purge must not reopen it. Before, the
   * session went back to pause and each new attempt got a 409.
   */
  it('stays closed and invalidates the caches if the local purge fails after the server stop', async () => {
    await startSession();
    await advance(20_000);
    const clear = jest.spyOn(buffer, 'clearBuffer').mockRejectedValueOnce(new Error('disque plein'));

    await expect(useSessionStore.getState().stop()).resolves.toMatchObject({ status: 'completed' });

    expect(useSessionStore.getState().status).toBe('idle');
    expect(queries.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['stats'] });
    clear.mockRestore();
  });

  it('purges a resurrected session the server already closed (409)', async () => {
    const { ApiError } = require('../../api/client');
    await startSession();
    api.stopActivity.mockRejectedValue(
      new ApiError({ title: 'Conflict', status: 409, detail: 'Transition invalide' }),
    );

    await expect(useSessionStore.getState().stop()).rejects.toThrow('Séance déjà enregistrée');
    await settle();

    expect(useSessionStore.getState().status).toBe('idle');
    expect(await buffer.loadSession()).toBeNull();
  });
});

describe('GPS mode (#36)', () => {
  it('starts in balanced mode when nothing is specified', async () => {
    await startSession();
    expect(gps.startGpsWatch).toHaveBeenCalledWith(expect.any(Function), 'balanced');
    expect(gps.startBackgroundUpdates).toHaveBeenCalledWith('balanced');
  });

  it('applies the chosen mode at start and keeps it on resume', async () => {
    api.startActivity.mockResolvedValue(activity());
    await useSessionStore.getState().start('running', 25, 'saver');
    expect(gps.startGpsWatch).toHaveBeenLastCalledWith(expect.any(Function), 'saver');
    expect(gps.startBackgroundUpdates).toHaveBeenCalledWith('saver');

    await useSessionStore.getState().pause();
    await useSessionStore.getState().resume();
    expect(gps.startGpsWatch).toHaveBeenLastCalledWith(expect.any(Function), 'saver');
  });
});

describe('GPS mode after a kill (PR #80 review)', () => {
  it('resumes a recovered session with its own mode, not the default mode', async () => {
    api.startActivity.mockResolvedValue(activity());
    await useSessionStore.getState().start('running', 25, 'saver');
    const saved = await buffer.loadSession();

    // The app is killed: new module, same buffer.
    jest.resetModules();
    jest.doMock('../buffer', () => buffer);
    jest.doMock('../../api/activities', () => api);
    jest.doMock('../uploader', () => uploader);
    useSessionStore = require('../use-session-store').useSessionStore;
    gps = require('../../gps');
    gps.startGpsWatch.mockResolvedValue({ remove: removeWatch });
    await buffer.saveSession(saved as NonNullable<typeof saved>);

    expect(await useSessionStore.getState().recover()).toBe(true);
    await useSessionStore.getState().resume();
    expect(gps.startGpsWatch).toHaveBeenLastCalledWith(expect.any(Function), 'saver');
  });
});

