/**
 * Machine à états du moteur de séance (#40) :
 * idle → starting → active ⇄ paused → stopping.
 *
 * Ce qui est vérifié ici, ce sont les garanties de l'Epic 3 : une séance ne
 * démarre jamais à moitié, le temps de pause ne compte pas dans la durée, un
 * échec d'envoi laisse la séance récupérable au lieu de la perdre, et une app
 * tuée se rattrape depuis le buffer.
 *
 * Le buffer est remplacé par l'implémentation mémoire (`buffer.web.ts`) : même
 * contrat, mais on peut interroger son état réel plutôt que des appels mockés.
 * `metrics.ts` reste le vrai moteur — les métriques rejouées à la récupération
 * sont donc comparées aux fixtures de parité avec le backend.
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

jest.mock('../../gps', () => ({
  startGpsWatch: jest.fn(),
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
    notes: null,
    metrics: {},
    ...overrides,
  };
}

// Modules re-requis à chaque test : le store garde son état moteur (GPS,
// timers, compteur de seq) dans des variables de module.
type Store = typeof import('../use-session-store').useSessionStore;
type Api = jest.Mocked<typeof import('../../api/activities')>;
type Gps = jest.Mocked<typeof import('../../gps')>;
type Uploader = jest.Mocked<typeof import('../uploader')>;
type Buffer = typeof import('../buffer.web');

let useSessionStore: Store;
let api: Api;
let gps: Gps;
let uploader: Uploader;
let buffer: Buffer;
let removeWatch: jest.Mock;

/** Laisse tourner les promesses non attendues (appendPoint, best-effort API). */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
  }
}

/**
 * Avance le temps de `ms` : l'horloge ET les timers, ensemble.
 * `jest.advanceTimersByTime` déplace aussi `Date.now()` — mélanger un
 * `setSystemTime` avec un `advanceTimersByTime` décale le chrono d'un tick.
 * Le temps de ces tests est donc piloté uniquement par cette fonction, à
 * partir de T0.
 */
async function advance(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await settle();
}

/** Simule l'arrivée d'un fix GPS par le watch en cours. */
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
  it('passe de idle à active et arme tout le moteur', async () => {
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

  it('persiste la séance dans le buffer avant le premier fix', async () => {
    await startSession();

    expect(await buffer.loadSession()).toEqual({
      activityId: ACTIVITY_ID,
      sportType: 'running',
      startedAtMs: T0,
      maxSpeedKmh: 25,
      pausedTotalS: 0,
      pausedAtMs: null,
    });
  });

  it('refuse de démarrer une seconde séance', async () => {
    await startSession();
    await expect(useSessionStore.getState().start('walking', 10)).rejects.toThrow(
      'Une séance est déjà en cours.',
    );
    expect(useSessionStore.getState().sportType).toBe('running');
    expect(api.startActivity).toHaveBeenCalledTimes(1);
  });

  it('annule l\'activité serveur si le GPS est refusé (pas de séance fantôme)', async () => {
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

  it('reste en idle si le serveur refuse de créer l\'activité', async () => {
    api.startActivity.mockRejectedValue(new Error('Erreur réseau'));

    await expect(useSessionStore.getState().start('running', 25)).rejects.toThrow('Erreur réseau');
    expect(useSessionStore.getState().status).toBe('idle');
    expect(api.deleteActivity).not.toHaveBeenCalled();
  });
});

describe('fix GPS pendant une séance active', () => {
  it('persiste chaque fix et publie les métriques live', async () => {
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

  it('persiste même un fix écarté par les filtres (le serveur tranchera)', async () => {
    await startSession();
    await emitFix(cleanTrack[0]);
    await emitFix({ ...cleanTrack[1], accuracyM: 120 });

    // Deux points en base, un seul dans le tracé affiché.
    expect(await buffer.allPoints()).toHaveLength(2);
    expect(useSessionStore.getState().path).toHaveLength(1);
    expect(useSessionStore.getState().live.distanceM).toBe(0);
    expect(useSessionStore.getState().gpsAccuracyM).toBe(120);
  });

  it('ignore les fix qui arrivent hors état active', async () => {
    await startSession();
    await useSessionStore.getState().pause();
    await emitFix(cleanTrack[0]);

    expect(await buffer.allPoints()).toHaveLength(0);
  });

  it('fait retomber la vitesse à zéro après 5 s sans fix', async () => {
    await startSession();
    await emitFix({ ...cleanTrack[0], recordedAtMs: T0 });
    // 20 m en 4 s = 5 m/s : plausible en courant, donc accepté.
    await emitFix({ ...cleanTrack[0], lat: 45.0 + 20 * DEG_PER_M, recordedAtMs: T0 + 4000 });

    await advance(5000); // dernier fix il y a 1 s : la vitesse s'affiche
    expect(useSessionStore.getState().live.smoothedSpeedMs).toBeCloseTo(5, 1);

    await advance(10_000); // plus rien depuis 11 s : signal perdu
    expect(useSessionStore.getState().live.smoothedSpeedMs).toBe(0);
  });

  it('pousse le buffer vers le serveur toutes les 10 s', async () => {
    await startSession();
    await advance(30_000);
    expect(uploader.flushTrackPoints).toHaveBeenCalledTimes(3);
    expect(uploader.flushTrackPoints).toHaveBeenCalledWith(ACTIVITY_ID);
  });
});

describe('pause / resume', () => {
  it('gèle le chronomètre et coupe le GPS à la pause', async () => {
    await startSession();
    await advance(10_000);

    await useSessionStore.getState().pause();

    expect(useSessionStore.getState().status).toBe('paused');
    expect(useSessionStore.getState().live.elapsedS).toBe(10);
    expect(useSessionStore.getState().live.smoothedSpeedMs).toBe(0);
    expect(removeWatch).toHaveBeenCalledTimes(1);

    // Le chrono ne bouge plus, même 60 s plus tard.
    await advance(60_000);
    expect(useSessionStore.getState().live.elapsedS).toBe(10);
  });

  it('inscrit la pause dans le buffer pour survivre à un kill', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();

    expect(await buffer.loadSession()).toMatchObject({
      pausedTotalS: 0,
      pausedAtMs: T0 + 10_000,
    });
  });

  it('exclut le temps de pause de la durée écoulée', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();

    await advance(30_000); // 30 s de pause
    await useSessionStore.getState().resume();
    expect(useSessionStore.getState().status).toBe('active');

    await advance(5000);
    expect(useSessionStore.getState().live.elapsedS).toBe(15); // 45 s - 30 s
    expect(await buffer.loadSession()).toMatchObject({ pausedTotalS: 30, pausedAtMs: null });
  });

  it('cumule plusieurs pauses', async () => {
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

  it('relance le GPS au resume', async () => {
    await startSession();
    await useSessionStore.getState().pause();
    await useSessionStore.getState().resume();
    expect(gps.startGpsWatch).toHaveBeenCalledTimes(2);
  });

  it('ne fait rien si on met en pause hors état active', async () => {
    await useSessionStore.getState().pause();
    expect(useSessionStore.getState().status).toBe('idle');
    expect(api.pauseActivity).not.toHaveBeenCalled();
  });

  it('ne fait rien si on reprend hors état paused', async () => {
    await startSession();
    await useSessionStore.getState().resume();
    expect(api.resumeActivity).not.toHaveBeenCalled();
  });

  it('tolère un serveur injoignable (pause/resume best-effort)', async () => {
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
  it('envoie le tracé, clôt côté serveur et revient à idle', async () => {
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

  it('déduit le temps de pause de la durée envoyée', async () => {
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

  it('peut clôturer depuis l\'état paused, en gelant la fin à l\'instant de la pause', async () => {
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

  it('refuse de clôturer sans séance', async () => {
    await expect(useSessionStore.getState().stop()).rejects.toThrow('Aucune séance en cours.');
  });

  it('garde la séance récupérable si le tracé n\'a pas pu partir', async () => {
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
    // Rien n'est purgé : le tracé et la séance restent en base.
    expect(await buffer.loadSession()).toMatchObject({ pausedAtMs: T0 + 60_000 });
    expect(await buffer.allPoints()).toHaveLength(1);
  });

  it('réussit au deuxième essai, réseau revenu', async () => {
    await startSession();
    uploader.flushTrackPoints.mockResolvedValueOnce(false);
    await expect(useSessionStore.getState().stop()).rejects.toThrow(/Tracé GPS/);

    uploader.flushTrackPoints.mockResolvedValue(true);
    await expect(useSessionStore.getState().stop()).resolves.toMatchObject({
      status: 'completed',
    });
    expect(useSessionStore.getState().status).toBe('idle');
  });

  it('purge le local quand l\'activité n\'existe plus côté serveur (404)', async () => {
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

describe('recover — app tuée en pleine séance', () => {
  /** Écrit une séance orpheline dans le buffer, comme un kill l'aurait laissée. */
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

  it('ne récupère rien quand le buffer est vide', async () => {
    await expect(useSessionStore.getState().recover()).resolves.toBe(false);
    expect(useSessionStore.getState().status).toBe('idle');
  });

  it('ne récupère rien si une séance tourne déjà', async () => {
    await startSession();
    await expect(useSessionStore.getState().recover()).resolves.toBe(false);
  });

  it('reprend la séance en pause et rejoue les métriques du tracé', async () => {
    await orphanSession(cleanTrack);

    await expect(useSessionStore.getState().recover()).resolves.toBe(true);

    const state = useSessionStore.getState();
    expect(state.status).toBe('paused');
    expect(state.activityId).toBe(ACTIVITY_ID);
    expect(state.sportType).toBe('running');
    expect(state.path).toHaveLength(100);
    // Le rejeu passe par le vrai moteur : mêmes métriques que le backend.
    expect(state.live.distanceM).toBeCloseTo(JAVA_GOLDEN.cleanTrackDistanceM, 3);
  });

  it('compte le temps mort comme pause, borné au dernier point connu', async () => {
    await orphanSession(cleanTrack);
    const lastFixMs = cleanTrack[99].recordedAtMs;

    await useSessionStore.getState().recover();

    expect(await buffer.loadSession()).toMatchObject({ pausedAtMs: lastFixMs });
    // Le chrono est gelé à l'instant du dernier point, pas à maintenant.
    expect(useSessionStore.getState().live.elapsedS).toBe(
      Math.round((lastFixMs - T0) / 1000),
    );
  });

  it('respecte une pause explicite déjà enregistrée', async () => {
    await orphanSession(cleanTrack, T0 + 5000);
    await useSessionStore.getState().recover();
    expect(await buffer.loadSession()).toMatchObject({ pausedAtMs: T0 + 5000 });
    expect(useSessionStore.getState().live.elapsedS).toBe(5);
  });

  it('reprend la numérotation des points après le dernier seq connu', async () => {
    await orphanSession(cleanTrack);
    await useSessionStore.getState().recover();

    await advance(cleanTrack[99].recordedAtMs - T0);
    await useSessionStore.getState().resume();
    await emitFix({ ...cleanTrack[99], recordedAtMs: cleanTrack[99].recordedAtMs + 1000 });

    const seqs = (await buffer.allPoints()).map((p) => p.seq);
    expect(seqs).toHaveLength(101);
    expect(seqs[100]).toBe(100); // pas de collision avec les seq rejoués
  });

  it('récupère une séance sans aucun point (kill juste après le démarrage)', async () => {
    await orphanSession([]);
    await expect(useSessionStore.getState().recover()).resolves.toBe(true);
    expect(useSessionStore.getState().status).toBe('paused');
    expect(useSessionStore.getState().path).toEqual([]);
  });

  it('peut clôturer directement une séance récupérée', async () => {
    await orphanSession(cleanTrack);
    await useSessionStore.getState().recover();

    await expect(useSessionStore.getState().stop()).resolves.toMatchObject({
      status: 'completed',
    });
    expect(useSessionStore.getState().status).toBe('idle');
  });
});

/**
 * Anomalie relevée en écrivant ces tests : `resume()` écrit
 * `updatePauseState(pausedTotalS, null)` AVANT d'attendre `startGpsWatch()`.
 * Si le watch est refusé (permission de localisation révoquée en pleine
 * séance), la promesse rejette et le statut reste `paused` — mais `pausedAtMs`
 * est déjà remis à null. L'affichage ne bronche pas (le tick ignore l'état
 * paused), mais la borne de fin le fait : `stop()` prend alors
 * `pausedAtMs ?? Date.now()`, et tout le temps écoulé depuis la reprise ratée
 * est facturé comme du temps d'effort.
 *
 * Consigné en `it.failing` : le test décrit le comportement attendu et passera
 * au vert le jour du correctif. Voir #51.
 */
describe('resume refusé par le GPS', () => {
  it('laisse la séance en pause', async () => {
    await startSession();
    await advance(10_000);
    await useSessionStore.getState().pause();

    gps.startGpsWatch.mockRejectedValue(new Error('Permission de localisation refusée'));
    await advance(10_000);
    await expect(useSessionStore.getState().resume()).rejects.toThrow(/Permission/);

    expect(useSessionStore.getState().status).toBe('paused');
  });

  it('n\'altère pas la durée affichée', async () => {
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

  it.failing('devrait clôturer sur la durée réelle d\'effort, pas sur l\'heure de fin', async () => {
    await startSession();
    await advance(10_000); // 10 s d'effort
    await useSessionStore.getState().pause();

    gps.startGpsWatch.mockRejectedValue(new Error('Permission de localisation refusée'));
    await advance(10_000);
    await expect(useSessionStore.getState().resume()).rejects.toThrow(/Permission/);

    // 60 s de plus à l'arrêt, toujours en pause, puis clôture.
    await advance(60_000);
    gps.startGpsWatch.mockResolvedValue({ remove: removeWatch });
    await useSessionStore.getState().stop();

    expect(api.stopActivity).toHaveBeenCalledWith(
      ACTIVITY_ID,
      expect.objectContaining({ durationS: 10 }),
    );
  });
});
