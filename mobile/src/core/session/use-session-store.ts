/**
 * Session engine (Epic 3), state machine idle → starting → active ⇄ paused → stopping.
 * Orchestration: GPS → SQLite buffer (crash-proof) → live accumulator → batched upload.
 * DoD: network down for the whole session → full upload when it returns; app killed →
 * session recovered through recover().
 *
 * Server-side pause/resume are best effort (offline tolerated): stop reconciles everything
 * through the locally measured durationS, and the server recomputes the metrics from the
 * raw track.
 */
import { create } from 'zustand';

import {
  allPoints,
  appendPoint,
  clearBuffer,
  loadSession,
  saveSession,
  updatePauseState,
} from './buffer';
import { GpsAccumulator, SIGNAL_LOST_MS, type LatLng } from './metrics';
import { ZERO_SESSION_STATE, type SessionState } from './types';
import { flushTrackPoints } from './uploader';
import {
  deleteActivity,
  pauseActivity,
  resumeActivity,
  startActivity,
  stopActivity,
} from '../api/activities';
import { ApiError } from '../api/client';
import { queryClient } from '../api/query-client';
import {
  startBackgroundUpdates,
  startGpsWatch,
  stopBackgroundUpdates,
  type GpsFix,
  type GpsMode,
  type GpsSubscription,
} from '../gps';

export type SessionStatus = 'idle' | 'starting' | 'active' | 'paused' | 'stopping';

const TICK_MS = 1000;
const FLUSH_MS = 10_000;
/** Without an accepted fix for this long, the displayed speed drops back to zero. */
const SPEED_STALE_MS = 5000;

interface SessionStore {
  status: SessionStatus;
  activityId: string | null;
  sportType: string | null;
  live: SessionState;
  path: LatLng[];
  /** Accuracy of the last received fix (GPS signal indicator); null before the first. */
  gpsAccuracyM: number | null;
  /**
   * No usable fix for SIGNAL_LOST_MS (#19). Distinct from `gpsAccuracyM`: poor accuracy
   * is still a signal, here there is none at all.
   */
  signalLost: boolean;
  /**
   * Is locked-screen tracking active? `false` = "always" permission denied, the session
   * goes on but stops if the screen turns off (#16).
   */
  backgroundTracking: boolean;

  /** @param gpsMode preference #36; `balanced` = historical settings */
  start(sportType: string, maxGpsSpeedKmh: number, gpsMode?: GpsMode): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Final flush + server stop. Resolves with the completed activity (server metrics). */
  stop(): Promise<import('../../types/api').Activity>;
  /** Reloads an orphan session from the buffer (app killed). @returns true if recovered. */
  recover(): Promise<boolean>;
}

// Engine state outside React: GPS, timers, counters. The store only publishes what the
// UI displays.
let acc: GpsAccumulator | null = null;
let gpsSub: GpsSubscription | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let seq = 0;
let startedAtMs = 0;
let pausedTotalS = 0;
let pausedAtMs: number | null = null;
/**
 * GPS mode of the current session (#36), reused on resume. Persisted in the buffer: a
 * session recovered after a kill resumes with its own settings (PR #80 review).
 */
let gpsMode: GpsMode = 'balanced';
/** Resume in progress: concurrent `resume()` calls share the same promise. */
let resuming: Promise<void> | null = null;

function elapsedS(now = Date.now()): number {
  const end = pausedAtMs ?? now;
  return Math.max(0, Math.round((end - startedAtMs) / 1000) - pausedTotalS);
}

/**
 * A closed session changes the totals and the history (#69). Without this invalidation,
 * the summary read the totals of the week from before the session (the key is shared
 * with the home screen's goal card) and could celebrate a goal already reached.
 *
 * Placed here rather than in the tracking screen: it's the only place every successful
 * close goes through, whichever screen requested it.
 */
function invalidateAfterSession(): void {
  void queryClient.invalidateQueries({ queryKey: ['stats'] });
  void queryClient.invalidateQueries({ queryKey: ['activities'] });
}

function stopEngine(): void {
  gpsSub?.remove();
  gpsSub = null;
  // Otherwise the background task would outlive the session and keep writing to the
  // buffer, with an orphan persistent notification on Android.
  void stopBackgroundUpdates();
  if (tickTimer != null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (flushTimer != null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export const useSessionStore = create<SessionStore>()((set, get) => {
  function handleFix(fix: GpsFix): void {
    if (get().status !== 'active' || acc == null) {
      return;
    }
    const mySeq = seq;
    seq += 1;
    void appendPoint(mySeq, fix).catch(() => {});
    const accepted = acc.add(fix);
    set({
      gpsAccuracyM: fix.accuracyM,
      signalLost: false, // a received fix restores the signal, even if it's filtered afterwards
      live: acc.snapshot(elapsedS()),
      ...(accepted ? { path: [...acc.path] } : {}),
    });
  }

  function startTimers(): void {
    tickTimer = setInterval(() => {
      if (get().status !== 'active' || acc == null) {
        return;
      }
      const sinceLastFixMs = acc.lastAcceptedMs == null ? null : Date.now() - acc.lastAcceptedMs;
      const stale = sinceLastFixMs == null || sinceLastFixMs > SPEED_STALE_MS;
      const snapshot = acc.snapshot(elapsedS());
      // Signal loss is detected here rather than when a fix arrives: by definition, when
      // the signal is lost nothing arrives to listen to.
      set({
        live: stale ? { ...snapshot, smoothedSpeedMs: 0 } : snapshot,
        signalLost: sinceLastFixMs != null && sinceLastFixMs >= SIGNAL_LOST_MS,
      });
    }, TICK_MS);
    flushTimer = setInterval(() => {
      const { status, activityId } = get();
      if (status === 'active' && activityId != null) {
        void flushTrackPoints(activityId).catch(() => {});
      }
    }, FLUSH_MS);
  }

  /**
   * Body of `resume()`. Checks again after each wait that the paused session is still the
   * one that requested the resume: a `stop()` may complete while the GPS is being
   * obtained, and installing the watch afterwards would restart a closed session.
   */
  async function doResume(): Promise<void> {
    const { status, activityId: resumedId } = get();
    if (status !== 'paused') {
      return;
    }
    const stillPaused = () => get().status === 'paused' && get().activityId === resumedId;
    /**
     * GPS first, bookkeeping second (#51). `startGpsWatch` may reject: location permission
     * revoked mid-session, a real case on iOS. If the pause had been closed before, the
     * session would stay paused but without an end bound: `stop()` would bill all the
     * time elapsed since as effort time, and duration is the only metric the server takes
     * as is.
     *
     * Until the watch is obtained, nothing moves: neither `pausedAtMs`, nor
     * `pausedTotalS`, nor the buffer.
     */
    const watch = await startGpsWatch(handleFix, gpsMode);
    if (!stillPaused()) {
      watch.remove(); // closed (or abandoned) while the GPS was being obtained
      return;
    }
    const nextPausedTotalS =
      pausedAtMs == null
        ? pausedTotalS
        : pausedTotalS + Math.round((Date.now() - pausedAtMs) / 1000);
    try {
      await updatePauseState(nextPausedTotalS, null);
    } catch (error) {
      // Buffer unavailable: the resume isn't persisted, so it doesn't happen.
      watch.remove();
      throw error;
    }
    if (!stillPaused()) {
      // stop() completed during the write: it already purged the buffer, nothing to undo.
      watch.remove();
      return;
    }
    gpsSub = watch;
    pausedTotalS = nextPausedTotalS;
    pausedAtMs = null;
    set({ status: 'active' });
    const id = get().activityId;
    if (id != null) {
      void resumeActivity(id).catch(() => {});
    }
  }

  function resetToIdle(): void {
    stopEngine();
    acc = null;
    seq = 0;
    pausedTotalS = 0;
    pausedAtMs = null;
    gpsMode = 'balanced';
    set({
      status: 'idle',
      activityId: null,
      sportType: null,
      live: { ...ZERO_SESSION_STATE },
      path: [],
      gpsAccuracyM: null,
      signalLost: false,
      backgroundTracking: false,
    });
  }

  return {
    status: 'idle',
    activityId: null,
    sportType: null,
    live: { ...ZERO_SESSION_STATE },
    path: [],
    gpsAccuracyM: null,
    signalLost: false,
    backgroundTracking: false,

    async start(sportType, maxGpsSpeedKmh, mode = 'balanced') {
      if (get().status !== 'idle') {
        throw new Error('Une séance est déjà en cours.');
      }
      set({ status: 'starting' });
      let created: string | null = null;
      try {
        const activity = await startActivity(sportType);
        created = activity.id;
        startedAtMs = Date.parse(activity.startedAt);
        pausedTotalS = 0;
        pausedAtMs = null;
        seq = 0;
        acc = new GpsAccumulator(maxGpsSpeedKmh);
        await clearBuffer();
        gpsMode = mode;
        await saveSession({
          activityId: activity.id,
          sportType,
          startedAtMs,
          maxSpeedKmh: maxGpsSpeedKmh,
          pausedTotalS: 0,
          pausedAtMs: null,
          gpsMode,
        });
        gpsSub = await startGpsWatch(handleFix, gpsMode);
        // Requested AFTER the start, never at app launch: out of context, iOS flatly
        // refuses it. A denial doesn't interrupt the session: we stay in the foreground,
        // which the tracking screen reports (degradation, not failure).
        const background = await startBackgroundUpdates(gpsMode).catch(() => false);
        set({ backgroundTracking: background });
        startTimers();
        set({
          status: 'active',
          activityId: activity.id,
          sportType,
          live: { ...ZERO_SESSION_STATE },
          path: [],
          gpsAccuracyM: null,
          signalLost: false,
          backgroundTracking: false,
        });
      } catch (error) {
        // GPS denied or buffer unavailable: cancel the created activity
        if (created != null) {
          void deleteActivity(created).catch(() => {});
          void clearBuffer().catch(() => {});
        }
        resetToIdle();
        throw error;
      }
    },

    async pause() {
      if (get().status !== 'active') {
        return;
      }
      pausedAtMs = Date.now();
      gpsSub?.remove();
      gpsSub = null;
      set({
        status: 'paused',
        live: { ...get().live, elapsedS: elapsedS(), smoothedSpeedMs: 0 },
      });
      await updatePauseState(pausedTotalS, pausedAtMs);
      const id = get().activityId;
      if (id != null) {
        void pauseActivity(id).catch(() => {});
      }
    },

    resume() {
      // A single resume at a time: a double tap while the GPS is being obtained must not
      // install two watches (CodeRabbit review, PR #71).
      if (resuming == null) {
        resuming = doResume().finally(() => {
          resuming = null;
        });
      }
      return resuming;
    },

    async stop() {
      const { status, activityId } = get();
      if (activityId == null || status === 'idle' || status === 'stopping') {
        throw new Error('Aucune séance en cours.');
      }
      set({ status: 'stopping' });
      stopEngine();
      const endMs = pausedAtMs ?? Date.now();
      const durationS = elapsedS(endMs);
      let activity: import('../../types/api').Activity;
      try {
        const flushed = await flushTrackPoints(activityId);
        if (!flushed) {
          throw new Error('Tracé GPS pas encore envoyé — vérifie ta connexion puis réessaie.');
        }
        activity = await stopActivity(activityId, {
          endedAt: new Date(endMs).toISOString(),
          durationS,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          // The activity no longer exists on the server: the local buffer is orphaned
          await clearBuffer().catch(() => {});
          resetToIdle();
          throw new Error('Séance introuvable côté serveur — données locales purgées.');
        }
        if (error instanceof ApiError && error.status === 409) {
          // Already closed on the server: a previous stop succeeded but the local purge
          // had failed, and `recover()` brought the buffer back. The server is authoritative.
          await clearBuffer().catch(() => {});
          resetToIdle();
          invalidateAfterSession();
          throw new Error('Séance déjà enregistrée — données locales purgées.');
        }
        // Back to pause: the session stays recoverable, the user will retry
        if (pausedAtMs == null) {
          pausedAtMs = endMs;
        }
        await updatePauseState(pausedTotalS, pausedAtMs).catch(() => {});
        startTimers();
        set({ status: 'paused' });
        throw error;
      }
      /**
       * The server closed the session: nothing may reopen it anymore (CodeRabbit review,
       * PR #71). A failed local purge used to send it back to pause, and each new attempt
       * got a 409, since the server refuses to close a closed session. The purge is
       * therefore best effort, and the invalidation no longer depends on it.
       */
      invalidateAfterSession();
      await clearBuffer().catch(() => {});
      resetToIdle();
      return activity;
    },

    async recover() {
      if (get().status !== 'idle') {
        return false;
      }
      const session = await loadSession();
      if (session == null) {
        return false;
      }
      const points = await allPoints();
      startedAtMs = session.startedAtMs;
      pausedTotalS = session.pausedTotalS;
      gpsMode = session.gpsMode ?? 'balanced';
      acc = new GpsAccumulator(session.maxSpeedKmh);
      for (const p of points) {
        acc.add(p);
      }
      seq = points.length > 0 ? points[points.length - 1].seq + 1 : 0;
      // App killed mid-session: the dead time counts as a pause, bounded by the last
      // known point.
      pausedAtMs =
        session.pausedAtMs ??
        (points.length > 0 ? points[points.length - 1].recordedAtMs : Date.now());
      await updatePauseState(pausedTotalS, pausedAtMs);
      startTimers();
      set({
        status: 'paused',
        activityId: session.activityId,
        sportType: session.sportType,
        live: acc.snapshot(elapsedS()),
        path: [...acc.path],
        gpsAccuracyM: null,
        signalLost: false,
        backgroundTracking: false,
      });
      return true;
    },
  };
});
