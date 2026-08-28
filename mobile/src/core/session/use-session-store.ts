/**
 * Moteur de séance (Epic 3) — machine à états idle → starting → active ⇄
 * paused → stopping. Orchestration : GPS → buffer SQLite (anti-crash) →
 * accumulateur live → upload par lots. DoD : réseau coupé toute la séance →
 * upload complet au retour ; app tuée → séance récupérée via recover().
 *
 * pause/resume côté serveur sont best-effort (offline toléré) : le stop
 * réconcilie tout via durationS mesuré localement, et le serveur recalcule
 * les métriques depuis le tracé brut.
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
import {
  startBackgroundUpdates,
  startGpsWatch,
  stopBackgroundUpdates,
  type GpsFix,
  type GpsSubscription,
} from '../gps';

export type SessionStatus = 'idle' | 'starting' | 'active' | 'paused' | 'stopping';

const TICK_MS = 1000;
const FLUSH_MS = 10_000;
/** Sans fix accepté depuis ce délai, la vitesse affichée retombe à zéro. */
const SPEED_STALE_MS = 5000;

interface SessionStore {
  status: SessionStatus;
  activityId: string | null;
  sportType: string | null;
  live: SessionState;
  path: LatLng[];
  /** Précision du dernier fix reçu (indicateur signal GPS) ; null avant le premier. */
  gpsAccuracyM: number | null;
  /**
   * Aucun fix exploitable depuis SIGNAL_LOST_MS (#19). Distinct de `gpsAccuracyM` :
   * une précision médiocre reste un signal, ici il n'y en a plus du tout.
   */
  signalLost: boolean;
  /**
   * Le suivi écran verrouillé est-il actif ? `false` = permission « toujours » refusée,
   * la séance continue mais s'arrête si l'écran s'éteint (#16).
   */
  backgroundTracking: boolean;

  start(sportType: string, maxGpsSpeedKmh: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Flush final + stop serveur. Résout avec l'activité complétée (métriques serveur). */
  stop(): Promise<import('../../types/api').Activity>;
  /** Recharge une séance orpheline du buffer (app tuée). @returns true si récupérée. */
  recover(): Promise<boolean>;
}

// État moteur hors React : GPS, timers, compteurs. Le store ne publie que
// ce que l'UI affiche.
let acc: GpsAccumulator | null = null;
let gpsSub: GpsSubscription | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let seq = 0;
let startedAtMs = 0;
let pausedTotalS = 0;
let pausedAtMs: number | null = null;

function elapsedS(now = Date.now()): number {
  const end = pausedAtMs ?? now;
  return Math.max(0, Math.round((end - startedAtMs) / 1000) - pausedTotalS);
}

function stopEngine(): void {
  gpsSub?.remove();
  gpsSub = null;
  // Sans ça, la tâche d'arrière-plan survivrait à la séance et continuerait d'écrire
  // dans le buffer — avec, sur Android, une notification persistante orpheline.
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
      signalLost: false, // un fix reçu rétablit le signal, même s'il sera ensuite filtré
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
      // La perte de signal se détecte ici plutôt qu'à la réception d'un fix : par
      // définition, quand le signal est perdu il n'arrive plus rien à écouter.
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

  function resetToIdle(): void {
    stopEngine();
    acc = null;
    seq = 0;
    pausedTotalS = 0;
    pausedAtMs = null;
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

    async start(sportType, maxGpsSpeedKmh) {
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
        await saveSession({
          activityId: activity.id,
          sportType,
          startedAtMs,
          maxSpeedKmh: maxGpsSpeedKmh,
          pausedTotalS: 0,
          pausedAtMs: null,
        });
        gpsSub = await startGpsWatch(handleFix);
        // Demandée APRÈS le démarrage, jamais au lancement de l'app : hors contexte,
        // iOS la refuse en bloc. Un refus n'interrompt pas la séance — on reste en
        // premier plan, ce que l'écran de tracking signale (dégradation, pas échec).
        const background = await startBackgroundUpdates().catch(() => false);
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
        // GPS refusé ou buffer indisponible : on annule l'activité créée
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

    async resume() {
      if (get().status !== 'paused') {
        return;
      }
      if (pausedAtMs != null) {
        pausedTotalS += Math.round((Date.now() - pausedAtMs) / 1000);
        pausedAtMs = null;
      }
      await updatePauseState(pausedTotalS, null);
      gpsSub = await startGpsWatch(handleFix); // peut rejeter (permission) : on reste en pause
      set({ status: 'active' });
      const id = get().activityId;
      if (id != null) {
        void resumeActivity(id).catch(() => {});
      }
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
      try {
        const flushed = await flushTrackPoints(activityId);
        if (!flushed) {
          throw new Error('Tracé GPS pas encore envoyé — vérifie ta connexion puis réessaie.');
        }
        const activity = await stopActivity(activityId, {
          endedAt: new Date(endMs).toISOString(),
          durationS,
        });
        await clearBuffer();
        resetToIdle();
        return activity;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          // L'activité n'existe plus côté serveur : le buffer local est orphelin
          await clearBuffer().catch(() => {});
          resetToIdle();
          throw new Error('Séance introuvable côté serveur — données locales purgées.');
        }
        // Retour en pause : la séance reste récupérable, l'utilisateur réessaiera
        if (pausedAtMs == null) {
          pausedAtMs = endMs;
        }
        await updatePauseState(pausedTotalS, pausedAtMs).catch(() => {});
        startTimers();
        set({ status: 'paused' });
        throw error;
      }
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
      acc = new GpsAccumulator(session.maxSpeedKmh);
      for (const p of points) {
        acc.add(p);
      }
      seq = points.length > 0 ? points[points.length - 1].seq + 1 : 0;
      // App tuée en pleine séance : le temps mort compte comme pause,
      // bornée au dernier point connu.
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
