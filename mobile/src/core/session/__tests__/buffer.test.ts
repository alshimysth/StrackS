/**
 * Buffer anti-crash de séance (#40).
 *
 * C'est la pièce qui porte la garantie « zéro perte de séance » du PRD : chaque
 * fix GPS est persisté dès réception, et le tracé doit survivre à une app tuée
 * puis à un rejeu d'upload. Les deux implémentations du contrat (SQLite sur
 * mobile, mémoire sur web) sont passées dans la même suite.
 *
 * Le mock d'expo-sqlite est adossé à un vrai moteur SQLite : ce sont bien les
 * requêtes de buffer.ts qui sont exécutées (cf. support/expo-sqlite-mock.ts).
 */
import type { GpsFix } from '../../gps';
import * as webBuffer from '../buffer.web';

jest.mock('expo-sqlite', () =>
  require('./support/expo-sqlite-mock').createExpoSqliteMock(),
);

// Importé après le mock : buffer.ts ouvre sa base à la première requête.
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
};

const implementations: [string, BufferModule][] = [
  ['buffer.ts — SQLite (mobile)', sqliteBuffer],
  ['buffer.web.ts — mémoire (web)', webBuffer],
];

describe.each(implementations)('contrat du buffer — %s', (_label, buffer) => {
  beforeEach(async () => {
    await buffer.clearBuffer();
  });

  describe('séance', () => {
    it('fait l\'aller-retour de tous les champs', async () => {
      await buffer.saveSession(session);
      expect(await buffer.loadSession()).toEqual(session);
    });

    it('ne rend aucune séance quand le buffer est vide', async () => {
      expect(await buffer.loadSession()).toBeNull();
    });

    it('ne garde qu\'une seule séance : la dernière écrite écrase la précédente', async () => {
      await buffer.saveSession(session);
      await buffer.saveSession({ ...session, activityId: 'autre', sportType: 'walking' });
      const loaded = await buffer.loadSession();
      expect(loaded).toMatchObject({ activityId: 'autre', sportType: 'walking' });
    });

    it('met à jour l\'état de pause sans toucher au reste', async () => {
      await buffer.saveSession(session);
      await buffer.updatePauseState(42, T0 + 60_000);
      expect(await buffer.loadSession()).toEqual({
        ...session,
        pausedTotalS: 42,
        pausedAtMs: T0 + 60_000,
      });
    });

    it('sait revenir d\'une pause (pausedAtMs remis à null)', async () => {
      await buffer.saveSession(session);
      await buffer.updatePauseState(42, T0 + 60_000);
      await buffer.updatePauseState(99, null);
      expect(await buffer.loadSession()).toMatchObject({ pausedTotalS: 99, pausedAtMs: null });
    });

    it('ne casse pas quand aucune séance n\'est ouverte', async () => {
      await expect(buffer.updatePauseState(10, null)).resolves.toBeUndefined();
      expect(await buffer.loadSession()).toBeNull();
    });
  });

  describe('points du tracé', () => {
    it('rend les points dans l\'ordre des seq', async () => {
      for (const seq of [0, 1, 2]) {
        await buffer.appendPoint(seq, point(seq));
      }
      expect((await buffer.allPoints()).map((p) => p.seq)).toEqual([0, 1, 2]);
    });

    it('conserve altitude et précision absentes comme nulles', async () => {
      await buffer.appendPoint(0, point(0, { altitudeM: null, accuracyM: null }));
      const [stored] = await buffer.allPoints();
      expect(stored.altitudeM).toBeNull();
      expect(stored.accuracyM).toBeNull();
      expect(stored.lat).toBeCloseTo(45.0, 10);
    });

    it('rend tout le tracé, acquitté ou non (récupération après kill)', async () => {
      for (let seq = 0; seq < 5; seq++) {
        await buffer.appendPoint(seq, point(seq));
      }
      await buffer.markUploaded([0, 1, 2]);
      expect(await buffer.allPoints()).toHaveLength(5);
    });
  });

  describe('file d\'attente d\'upload', () => {
    beforeEach(async () => {
      for (let seq = 0; seq < 10; seq++) {
        await buffer.appendPoint(seq, point(seq));
      }
    });

    it('ne rend que les points pas encore acquittés, par ordre de seq', async () => {
      await buffer.markUploaded([0, 1, 2, 3]);
      expect((await buffer.pendingPoints(100)).map((p) => p.seq)).toEqual([4, 5, 6, 7, 8, 9]);
    });

    it('respecte la taille de lot demandée', async () => {
      expect(await buffer.pendingPoints(3)).toHaveLength(3);
      expect((await buffer.pendingPoints(3)).map((p) => p.seq)).toEqual([0, 1, 2]);
    });

    it('rend une file vide quand tout est acquitté', async () => {
      await buffer.markUploaded([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(await buffer.pendingPoints(100)).toEqual([]);
    });

    it('accepte un acquittement vide sans broncher', async () => {
      await expect(buffer.markUploaded([])).resolves.toBeUndefined();
      expect(await buffer.pendingPoints(100)).toHaveLength(10);
    });

    it('acquitte un seq inconnu sans effet de bord', async () => {
      await buffer.markUploaded([999]);
      expect(await buffer.pendingPoints(100)).toHaveLength(10);
    });

    it('est idempotent : réacquitter les mêmes points ne change rien', async () => {
      await buffer.markUploaded([0, 1]);
      await buffer.markUploaded([0, 1]);
      expect((await buffer.pendingPoints(100)).map((p) => p.seq)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe('purge', () => {
    it('efface séance et points d\'un coup', async () => {
      await buffer.saveSession(session);
      await buffer.appendPoint(0, point(0));
      await buffer.clearBuffer();
      expect(await buffer.loadSession()).toBeNull();
      expect(await buffer.allPoints()).toEqual([]);
    });

    it('est rejouable sur un buffer déjà vide', async () => {
      await expect(buffer.clearBuffer()).resolves.toBeUndefined();
      await expect(buffer.clearBuffer()).resolves.toBeUndefined();
    });
  });
});

/**
 * Deux points du contrat que `buffer.web.ts` ne tient pas (relevé par la suite
 * partagée ci-dessus). Aucun des deux n'est atteignable aujourd'hui : le
 * store n'écrit jamais deux fois le même seq, les seq sont monotones, le
 * buffer web est vidé au rechargement (donc `recover()` n'y trouve rien) et le
 * web n'est pas une cible produit de la Phase 1.
 *
 * Consignés en `it.failing` plutôt qu'ignorés : le jour où le contrat sera
 * aligné, ces tests passeront au vert et Jest exigera de les repasser en `it`
 * normal — impossible de corriger le buffer web sans que le test le sache.
 * Voir #52.
 */
describe('divergences connues de buffer.web.ts', () => {
  beforeEach(async () => {
    await sqliteBuffer.clearBuffer();
    await webBuffer.clearBuffer();
  });

  it('SQLite ignore un seq déjà écrit et garde la première valeur (INSERT OR IGNORE)', async () => {
    await sqliteBuffer.appendPoint(0, point(0, { lat: 45.0 }));
    await sqliteBuffer.appendPoint(0, point(0, { lat: 46.0 }));
    const stored = await sqliteBuffer.allPoints();
    expect(stored).toHaveLength(1);
    expect(stored[0].lat).toBeCloseTo(45.0, 10);
  });

  it.failing('web devrait aussi ignorer un seq déjà écrit (aujourd\'hui il l\'empile)', async () => {
    await webBuffer.appendPoint(0, point(0, { lat: 45.0 }));
    await webBuffer.appendPoint(0, point(0, { lat: 46.0 }));
    expect(await webBuffer.allPoints()).toHaveLength(1);
  });

  it('SQLite trie par seq même si les points arrivent en désordre', async () => {
    for (const seq of [2, 0, 1]) {
      await sqliteBuffer.appendPoint(seq, point(seq));
    }
    expect((await sqliteBuffer.allPoints()).map((p) => p.seq)).toEqual([0, 1, 2]);
  });

  it.failing('web devrait aussi trier par seq (aujourd\'hui il rend l\'ordre d\'insertion)', async () => {
    for (const seq of [2, 0, 1]) {
      await webBuffer.appendPoint(seq, point(seq));
    }
    expect((await webBuffer.allPoints()).map((p) => p.seq)).toEqual([0, 1, 2]);
  });
});
