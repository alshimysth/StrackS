/**
 * Web fallback of the session buffer: in memory only (no wasm SQLite, the web isn't a
 * Phase 1 product target). Same contract as buffer.ts; crash recovery therefore doesn't
 * exist on the web.
 *
 * The contract is kept **identically** (#52), checked by the same suite as SQLite: an
 * already written seq is ignored (`INSERT OR IGNORE`, the first value wins) and reads come
 * out sorted by seq (`ORDER BY seq`). It isn't overzealous: `recover()` replays
 * `allPoints()` into the GPS accumulator, and an out-of-order track would produce
 * backwards segments there, hence a wrong distance.
 */
import type { GpsFix } from '../gps';

export interface BufferedSession {
  activityId: string;
  sportType: string;
  startedAtMs: number;
  maxSpeedKmh: number;
  pausedTotalS: number;
  pausedAtMs: number | null;
}

export interface BufferedPoint extends GpsFix {
  seq: number;
}

let session: BufferedSession | null = null;
/** Indexed by seq: it's the primary key of the SQLite table. */
let points = new Map<number, BufferedPoint & { uploaded: boolean }>();

function bySeq(): (BufferedPoint & { uploaded: boolean })[] {
  return [...points.values()].sort((a, b) => a.seq - b.seq);
}

/** Copy without the internal flag, like a row read back from SQLite. */
function toPoint({ uploaded: _uploaded, ...point }: BufferedPoint & { uploaded: boolean }) {
  return point;
}

export async function saveSession(next: BufferedSession): Promise<void> {
  session = { ...next };
}

export async function loadSession(): Promise<BufferedSession | null> {
  return session == null ? null : { ...session };
}

export async function updatePauseState(
  pausedTotalS: number,
  pausedAtMs: number | null,
): Promise<void> {
  if (session != null) {
    session = { ...session, pausedTotalS, pausedAtMs };
  }
}

export async function appendPoint(seq: number, fix: GpsFix): Promise<void> {
  if (!points.has(seq)) {
    points.set(seq, { ...fix, seq, uploaded: false });
  }
}

/**
 * Mirror of `buffer.ts` (#16). Background tracking doesn't exist on the web, but the
 * function must exist so both modules keep the same contract.
 */
export async function nextSeqAfterBuffer(): Promise<number> {
  let max = -1;
  for (const seq of points.keys()) {
    max = Math.max(max, seq);
  }
  return max + 1;
}

export async function pendingPoints(limit: number): Promise<BufferedPoint[]> {
  return bySeq()
    .filter((p) => !p.uploaded)
    .slice(0, limit)
    .map(toPoint);
}

export async function markUploaded(seqs: number[]): Promise<void> {
  for (const seq of seqs) {
    const p = points.get(seq);
    if (p != null) {
      p.uploaded = true;
    }
  }
}

export async function allPoints(): Promise<BufferedPoint[]> {
  return bySeq().map(toPoint);
}

export async function clearBuffer(): Promise<void> {
  session = null;
  points = new Map();
}
