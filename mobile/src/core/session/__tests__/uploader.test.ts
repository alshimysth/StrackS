/**
 * File d'upload du tracé (#40) — réseau coupé et rejeu idempotent.
 *
 * La promesse du PRD est « zéro perte de séance » : une coupure réseau doit
 * laisser les points en attente, et le flush suivant ne doit renvoyer QUE ce
 * qui n'a pas été acquitté. Les tests utilisent le vrai buffer SQLite (via le
 * mock adossé à better-sqlite3) : c'est l'état réel de la file qui est vérifié,
 * pas une suite d'appels mockés.
 */
import * as buffer from '../buffer';
import { flushTrackPoints } from '../uploader';
import { uploadTrackPoints } from '../../api/activities';
import { ApiError } from '../../api/client';

jest.mock('expo-sqlite', () =>
  require('./support/expo-sqlite-mock').createExpoSqliteMock(),
);

jest.mock('../../api/activities', () => ({
  uploadTrackPoints: jest.fn(),
}));

const upload = uploadTrackPoints as jest.MockedFunction<typeof uploadTrackPoints>;

const ACTIVITY_ID = '11111111-2222-3333-4444-555555555555';
const T0 = Date.parse('2026-08-11T08:00:00Z');

async function fillBuffer(count: number): Promise<void> {
  for (let seq = 0; seq < count; seq++) {
    await buffer.appendPoint(seq, {
      recordedAtMs: T0 + seq * 1000,
      lat: 45.0 + seq * 0.0001,
      lng: 5.0,
      altitudeM: 200 + seq,
      accuracyM: 5,
    });
  }
}

function sentSeqs(): number[][] {
  return upload.mock.calls.map(([, points]) => points.map((p) => p.seq));
}

beforeEach(async () => {
  await buffer.clearBuffer();
  upload.mockResolvedValue({ received: 0, inserted: 0 });
});

describe('nominal', () => {
  it('ne contacte pas le serveur quand la file est vide', async () => {
    await expect(flushTrackPoints(ACTIVITY_ID)).resolves.toBe(true);
    expect(upload).not.toHaveBeenCalled();
  });

  it('envoie tous les points puis vide la file d\'attente', async () => {
    await fillBuffer(10);
    await expect(flushTrackPoints(ACTIVITY_ID)).resolves.toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await buffer.pendingPoints(100)).toEqual([]);
    // Les points restent en base : ils servent la récupération après kill.
    expect(await buffer.allPoints()).toHaveLength(10);
  });

  it('découpe en lots de 100, dans l\'ordre des seq', async () => {
    await fillBuffer(250);
    await expect(flushTrackPoints(ACTIVITY_ID)).resolves.toBe(true);
    const batches = sentSeqs();
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches[0][0]).toBe(0);
    expect(batches[2][49]).toBe(249);
  });

  it('envoie la charge utile attendue par l\'API', async () => {
    await fillBuffer(1);
    await flushTrackPoints(ACTIVITY_ID);
    expect(upload).toHaveBeenCalledWith(ACTIVITY_ID, [
      {
        seq: 0,
        recordedAt: '2026-08-11T08:00:00.000Z',
        lat: 45,
        lng: 5,
        altitudeM: 200,
        accuracyM: 5,
      },
    ]);
  });

  it('transmet altitude et précision absentes telles quelles', async () => {
    await buffer.appendPoint(0, {
      recordedAtMs: T0,
      lat: 45,
      lng: 5,
      altitudeM: null,
      accuracyM: null,
    });
    await flushTrackPoints(ACTIVITY_ID);
    expect(upload.mock.calls[0][1][0]).toMatchObject({ altitudeM: null, accuracyM: null });
  });
});

describe('réseau coupé', () => {
  it('rend false et laisse tous les points en attente', async () => {
    await fillBuffer(10);
    upload.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(flushTrackPoints(ACTIVITY_ID)).resolves.toBe(false);
    expect((await buffer.pendingPoints(100)).map((p) => p.seq)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('réussit au flush suivant, réseau revenu', async () => {
    await fillBuffer(10);
    upload.mockRejectedValueOnce(new TypeError('Network request failed'));

    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(false);
    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(true);
    expect(await buffer.pendingPoints(100)).toEqual([]);
  });

  it('ne renvoie JAMAIS un lot déjà acquitté (rejeu idempotent)', async () => {
    // 250 points : le 1er lot passe, le 2e tombe sur la coupure.
    await fillBuffer(250);
    upload.mockResolvedValueOnce({ received: 100, inserted: 100 });
    upload.mockRejectedValueOnce(new TypeError('Network request failed'));

    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(false);
    expect((await buffer.pendingPoints(1000)).map((p) => p.seq)[0]).toBe(100);

    upload.mockResolvedValue({ received: 0, inserted: 0 });
    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(true);

    // Chaque seq n'a été envoyé qu'une fois — sauf ceux du lot interrompu,
    // qui ne peuvent pas avoir été acquittés.
    const allSent = sentSeqs().flat();
    const sentOnce = allSent.filter((seq) => seq < 100);
    expect(new Set(sentOnce).size).toBe(sentOnce.length);
    expect(new Set(allSent).size).toBe(250);
  });

  it('tient une séance entière hors ligne puis tout envoie au retour', async () => {
    // 45 min à 1 fix/s : le buffer encaisse, rien n'est perdu.
    await fillBuffer(2700);
    upload.mockRejectedValue(new TypeError('Network request failed'));
    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(false);
    expect(await buffer.pendingPoints(5000)).toHaveLength(2700);

    upload.mockReset();
    upload.mockResolvedValue({ received: 0, inserted: 0 });
    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(true);
    expect(sentSeqs().flat()).toHaveLength(2700);
    expect(await buffer.pendingPoints(5000)).toEqual([]);
  });
});

describe('erreurs API', () => {
  it('laisse remonter une erreur API à l\'appelant (404 activité supprimée)', async () => {
    await fillBuffer(5);
    upload.mockRejectedValueOnce(
      new ApiError({ title: 'Not Found', status: 404, detail: 'Activité introuvable' }),
    );

    await expect(flushTrackPoints(ACTIVITY_ID)).rejects.toBeInstanceOf(ApiError);
    expect(await buffer.pendingPoints(100)).toHaveLength(5);
  });

  it('laisse remonter un 401 sans acquitter quoi que ce soit', async () => {
    await fillBuffer(5);
    upload.mockRejectedValueOnce(
      new ApiError({ title: 'Unauthorized', status: 401, detail: 'Token expiré' }),
    );

    await expect(flushTrackPoints(ACTIVITY_ID)).rejects.toMatchObject({ status: 401 });
    expect(await buffer.pendingPoints(100)).toHaveLength(5);
  });

  it('reste utilisable après une erreur API (verrou relâché)', async () => {
    await fillBuffer(5);
    upload.mockRejectedValueOnce(
      new ApiError({ title: 'Server Error', status: 500, detail: 'Boom' }),
    );
    await expect(flushTrackPoints(ACTIVITY_ID)).rejects.toBeInstanceOf(ApiError);

    upload.mockResolvedValue({ received: 5, inserted: 5 });
    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(true);
  });
});

describe('verrou de concurrence', () => {
  it('ignore un flush lancé pendant qu\'un autre tourne', async () => {
    await fillBuffer(10);
    let release: (() => void) | undefined;
    // Résolue dès que l'envoi est réellement en vol : pas de course entre le
    // premier flush et l'assertion sur le second.
    const inFlight = new Promise<void>((uploadStarted) => {
      upload.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ received: 10, inserted: 10 });
            uploadStarted();
          }),
      );
    });

    const first = flushTrackPoints(ACTIVITY_ID);
    await inFlight;
    // Le tick du flush périodique tombe pendant l'envoi : il doit passer son tour.
    await expect(flushTrackPoints(ACTIVITY_ID)).resolves.toBe(false);

    release?.();
    expect(await first).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
