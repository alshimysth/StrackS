/**
 * Fallback web du buffer de séance : en mémoire uniquement (pas de SQLite
 * wasm — le web n'est pas une cible produit de la Phase 1). Même contrat que
 * buffer.ts ; la récupération anti-crash n'existe donc pas sur web.
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
let points: (BufferedPoint & { uploaded: boolean })[] = [];

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
  points.push({ ...fix, seq, uploaded: false });
}

/**
 * Miroir de `buffer.ts` (#16). Le suivi en arrière-plan n'existe pas sur le web, mais la
 * fonction doit exister pour que les deux modules tiennent le même contrat — c'est le
 * défaut que relève #52.
 */
export async function nextSeqAfterBuffer(): Promise<number> {
  return points.reduce((max, p) => Math.max(max, p.seq), -1) + 1;
}

export async function pendingPoints(limit: number): Promise<BufferedPoint[]> {
  return points.filter((p) => !p.uploaded).slice(0, limit);
}

export async function markUploaded(seqs: number[]): Promise<void> {
  const done = new Set(seqs);
  for (const p of points) {
    if (done.has(p.seq)) {
      p.uploaded = true;
    }
  }
}

export async function allPoints(): Promise<BufferedPoint[]> {
  return [...points];
}

export async function clearBuffer(): Promise<void> {
  session = null;
  points = [];
}
