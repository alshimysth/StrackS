/**
 * Track upload queue (#40): network down and idempotent replay.
 *
 * The PRD's promise is "zero session loss": a network outage must leave the points
 * pending, and the next flush must resend ONLY what wasn't acknowledged. The tests use
 * the real SQLite buffer (through the better-sqlite3-backed mock): the actual state of
 * the queue is checked, not a series of mocked calls.
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
  it('does not contact the server when the queue is empty', async () => {
    await expect(flushTrackPoints(ACTIVITY_ID)).resolves.toBe(true);
    expect(upload).not.toHaveBeenCalled();
  });

  it('sends every point then empties the queue', async () => {
    await fillBuffer(10);
    await expect(flushTrackPoints(ACTIVITY_ID)).resolves.toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await buffer.pendingPoints(100)).toEqual([]);
    // The points stay in the database: they serve recovery after a kill.
    expect(await buffer.allPoints()).toHaveLength(10);
  });

  it('splits into batches of 100, in seq order', async () => {
    await fillBuffer(250);
    await expect(flushTrackPoints(ACTIVITY_ID)).resolves.toBe(true);
    const batches = sentSeqs();
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches[0][0]).toBe(0);
    expect(batches[2][49]).toBe(249);
  });

  it('sends the payload expected by the API', async () => {
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

  it('passes missing altitude and accuracy as is', async () => {
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

describe('network down', () => {
  it('returns false and leaves every point pending', async () => {
    await fillBuffer(10);
    upload.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(flushTrackPoints(ACTIVITY_ID)).resolves.toBe(false);
    expect((await buffer.pendingPoints(100)).map((p) => p.seq)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('succeeds on the next flush, network back', async () => {
    await fillBuffer(10);
    upload.mockRejectedValueOnce(new TypeError('Network request failed'));

    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(false);
    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(true);
    expect(await buffer.pendingPoints(100)).toEqual([]);
  });

  it('NEVER resends an already acknowledged batch (idempotent replay)', async () => {
    // 250 points: the 1st batch goes through, the 2nd hits the outage.
    await fillBuffer(250);
    upload.mockResolvedValueOnce({ received: 100, inserted: 100 });
    upload.mockRejectedValueOnce(new TypeError('Network request failed'));

    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(false);
    expect((await buffer.pendingPoints(1000)).map((p) => p.seq)[0]).toBe(100);

    upload.mockResolvedValue({ received: 0, inserted: 0 });
    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(true);

    // Each seq was sent only once, except those of the interrupted batch, which can't
    // have been acknowledged.
    const allSent = sentSeqs().flat();
    const sentOnce = allSent.filter((seq) => seq < 100);
    expect(new Set(sentOnce).size).toBe(sentOnce.length);
    expect(new Set(allSent).size).toBe(250);
  });

  it('holds a whole offline session then sends everything on return', async () => {
    // 45 min at 1 fix/s: the buffer copes, nothing is lost.
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

describe('API errors', () => {
  it('lets an API error bubble up to the caller (404 deleted activity)', async () => {
    await fillBuffer(5);
    upload.mockRejectedValueOnce(
      new ApiError({ title: 'Not Found', status: 404, detail: 'Activité introuvable' }),
    );

    await expect(flushTrackPoints(ACTIVITY_ID)).rejects.toBeInstanceOf(ApiError);
    expect(await buffer.pendingPoints(100)).toHaveLength(5);
  });

  it('lets a 401 bubble up without acknowledging anything', async () => {
    await fillBuffer(5);
    upload.mockRejectedValueOnce(
      new ApiError({ title: 'Unauthorized', status: 401, detail: 'Token expiré' }),
    );

    await expect(flushTrackPoints(ACTIVITY_ID)).rejects.toMatchObject({ status: 401 });
    expect(await buffer.pendingPoints(100)).toHaveLength(5);
  });

  it('stays usable after an API error (lock released)', async () => {
    await fillBuffer(5);
    upload.mockRejectedValueOnce(
      new ApiError({ title: 'Server Error', status: 500, detail: 'Boom' }),
    );
    await expect(flushTrackPoints(ACTIVITY_ID)).rejects.toBeInstanceOf(ApiError);

    upload.mockResolvedValue({ received: 5, inserted: 5 });
    expect(await flushTrackPoints(ACTIVITY_ID)).toBe(true);
  });
});

describe('concurrency lock', () => {
  it('ignores a flush started while another one runs', async () => {
    await fillBuffer(10);
    let release: (() => void) | undefined;
    // Resolved as soon as the upload is really in flight: no race between the first
    // flush and the assertion on the second.
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
    // The periodic flush tick lands during the upload: it must skip its turn.
    await expect(flushTrackPoints(ACTIVITY_ID)).resolves.toBe(false);

    release?.();
    expect(await first).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
