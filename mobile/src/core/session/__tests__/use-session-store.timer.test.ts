/**
 * The session engine for a timed sport (no track): no GPS is touched, the draft is
 * persisted and recovered, and the stop sends the module's report instead of a track.
 *
 * Same harness as `use-session-store.test.ts`: in-memory buffer, mocked API and GPS.
 */
import type { Activity } from '../../../types/api';

jest.mock('../buffer', () => require('../buffer.web'));
jest.mock('../uploader', () => ({ flushTrackPoints: jest.fn() }));
jest.mock('../../api/activities', () => ({
  startActivity: jest.fn(),
  pauseActivity: jest.fn(),
  resumeActivity: jest.fn(),
  stopActivity: jest.fn(),
  deleteActivity: jest.fn(),
}));
jest.mock('../../api/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../gps', () => ({
  startGpsWatch: jest.fn(),
  startBackgroundUpdates: jest.fn().mockResolvedValue(false),
  stopBackgroundUpdates: jest.fn().mockResolvedValue(undefined),
}));

const T0 = Date.parse('2026-11-12T18:00:00Z');
const ACTIVITY_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const BOULDERING = {
  sportType: 'bouldering',
  trackingMode: 'timer',
  initialDraft: { location: 'indoor', climbs: [], nextGrade: '5' },
} as const;

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: ACTIVITY_ID,
    sportType: 'bouldering',
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

type Store = typeof import('../use-session-store').useSessionStore;
let useSessionStore: Store;
let api: jest.Mocked<typeof import('../../api/activities')>;
let gps: jest.Mocked<typeof import('../../gps')>;
let uploader: jest.Mocked<typeof import('../uploader')>;
let buffer: typeof import('../buffer.web');

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
  }
}

async function advance(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await settle();
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  // A kill test re-points '../buffer' at its own instance with doMock, and that
  // registration survives resetModules: without this, the next test's store would write
  // to the previous test's buffer while the test reads a fresh one.
  jest.doMock('../buffer', () => require('../buffer.web'));
  useSessionStore = require('../use-session-store').useSessionStore;
  api = require('../../api/activities');
  gps = require('../../gps');
  uploader = require('../uploader');
  buffer = require('../buffer.web');
  api.startActivity.mockResolvedValue(activity());
  api.stopActivity.mockResolvedValue(activity({ status: 'completed', durationS: 0 }));
  api.pauseActivity.mockResolvedValue(activity({ status: 'paused' }));
  api.resumeActivity.mockResolvedValue(activity());
});

afterEach(async () => {
  await buffer.clearBuffer();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('a timed session', () => {
  it('starts without touching the GPS and persists the initial draft', async () => {
    await useSessionStore.getState().start(BOULDERING);

    const state = useSessionStore.getState();
    expect(state.status).toBe('active');
    expect(state.trackingMode).toBe('timer');
    expect(state.draft).toEqual(BOULDERING.initialDraft);
    expect(gps.startGpsWatch).not.toHaveBeenCalled();
    expect(gps.startBackgroundUpdates).not.toHaveBeenCalled();
    expect(await buffer.loadSession()).toMatchObject({
      trackingMode: 'timer',
      draft: BOULDERING.initialDraft,
    });
  });

  it('runs the timer and never flushes a track', async () => {
    await useSessionStore.getState().start(BOULDERING);
    await advance(30_000);
    expect(useSessionStore.getState().live.elapsedS).toBe(30);
    expect(useSessionStore.getState().live.distanceM).toBe(0);
    expect(uploader.flushTrackPoints).not.toHaveBeenCalled();
  });

  it('persists each draft change so it survives a kill', async () => {
    await useSessionStore.getState().start(BOULDERING);
    const next = { ...BOULDERING.initialDraft, climbs: [{ grade: '6A', result: 'flash', attempts: 1 }] };
    await useSessionStore.getState().setDraft(next);
    expect(useSessionStore.getState().draft).toEqual(next);
    expect((await buffer.loadSession())?.draft).toEqual(next);
  });

  it('pauses and resumes without a GPS watch', async () => {
    await useSessionStore.getState().start(BOULDERING);
    await advance(10_000);
    await useSessionStore.getState().pause();
    await advance(20_000);
    await useSessionStore.getState().resume();
    await advance(5_000);
    expect(useSessionStore.getState().status).toBe('active');
    expect(useSessionStore.getState().live.elapsedS).toBe(15);
    expect(gps.startGpsWatch).not.toHaveBeenCalled();
  });

  it('sends the report at stop, with the measured duration, and no track', async () => {
    await useSessionStore.getState().start(BOULDERING);
    await advance(90_000);
    const metrics = { schemaVersion: 1, location: 'indoor', climbs: [] };

    const completed = await useSessionStore.getState().stop({ metrics });

    expect(uploader.flushTrackPoints).not.toHaveBeenCalled();
    expect(api.stopActivity).toHaveBeenCalledWith(ACTIVITY_ID, {
      endedAt: new Date(T0 + 90_000).toISOString(),
      durationS: 90,
      metrics,
    });
    expect(completed.status).toBe('completed');
    expect(useSessionStore.getState().status).toBe('idle');
    expect(useSessionStore.getState().draft).toBeNull();
    expect(await buffer.loadSession()).toBeNull();
  });

  it('recovers the draft after a kill, paused at the last checkpoint, without replaying any track', async () => {
    await useSessionStore.getState().start(BOULDERING);
    const next = { ...BOULDERING.initialDraft, climbs: [{ grade: '6B', result: 'send', attempts: 3 }] };
    await useSessionStore.getState().setDraft(next);
    await advance(65_000); // last checkpoint at 60 s

    // The app is killed: a fresh module, the buffer still there.
    jest.resetModules();
    jest.doMock('../buffer', () => buffer);
    const fresh: Store = require('../use-session-store').useSessionStore;
    jest.setSystemTime(T0 + 600_000);

    expect(await fresh.getState().recover()).toBe(true);
    const state = fresh.getState();
    expect(state.status).toBe('paused');
    expect(state.sportType).toBe('bouldering');
    expect(state.trackingMode).toBe('timer');
    expect(state.draft).toEqual(next);
    expect(state.path).toEqual([]);
    // The ten minutes the app was dead are a pause, not effort (PR #100 review): the
    // timer stopped at the last checkpoint, 60 s after the start.
    expect(state.live.elapsedS).toBe(60);
    expect(gps.startGpsWatch).not.toHaveBeenCalled();
  });

  /**
   * PR #100 review: killed right after a resume, before the next checkpoint. The pause
   * must be bounded at the resume instant, or the paused time would be subtracted twice
   * (checkpoint before the pause minus the full pause → zero effort).
   */
  it('recovers the effort time when killed right after a resume', async () => {
    await useSessionStore.getState().start(BOULDERING);
    await advance(600_000); // 10 min of effort, checkpoint at 600 s
    await useSessionStore.getState().pause();
    await advance(3_600_000); // an hour of pause
    await useSessionStore.getState().resume();
    await advance(500); // killed before the first tick after the resume

    jest.resetModules();
    jest.doMock('../buffer', () => buffer);
    const fresh: Store = require('../use-session-store').useSessionStore;
    jest.setSystemTime(Date.now() + 1_800_000);

    expect(await fresh.getState().recover()).toBe(true);
    expect(fresh.getState().live.elapsedS).toBe(600);
  });

  it('ignores a draft for a GPS session', async () => {
    await useSessionStore.getState().start({ sportType: 'running', trackingMode: 'gps', maxGpsSpeedKmh: 25 });
    await useSessionStore.getState().setDraft({ anything: true });
    expect(useSessionStore.getState().draft).toBeNull();
    expect((await buffer.loadSession())?.draft).toBeUndefined();
  });
});
