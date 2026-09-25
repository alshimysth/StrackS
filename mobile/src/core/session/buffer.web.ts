/**
 * Fallback web du buffer de séance : en mémoire uniquement (pas de SQLite
 * wasm — le web n'est pas une cible produit de la Phase 1). Même contrat que
 * buffer.ts ; la récupération anti-crash n'existe donc pas sur web.
 *
 * Le contrat est tenu **à l'identique** (#52), vérifié par la même suite que SQLite :
 * un seq déjà écrit est ignoré (`INSERT OR IGNORE`, la première valeur gagne) et les
 * lectures sortent triées par seq (`ORDER BY seq`). Ce n'est pas du zèle : `recover()`
 * rejoue `allPoints()` dans l'accumulateur GPS, et un tracé hors ordre y produirait
 * des segments à rebours — donc une distance fausse.
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
/** Indexé par seq : c'est la clé primaire de la table SQLite. */
let points = new Map<number, BufferedPoint & { uploaded: boolean }>();

function bySeq(): (BufferedPoint & { uploaded: boolean })[] {
  return [...points.values()].sort((a, b) => a.seq - b.seq);
}

/** Copie sans le drapeau interne, comme une ligne relue depuis SQLite. */
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
 * Miroir de `buffer.ts` (#16). Le suivi en arrière-plan n'existe pas sur le web, mais la
 * fonction doit exister pour que les deux modules tiennent le même contrat.
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
