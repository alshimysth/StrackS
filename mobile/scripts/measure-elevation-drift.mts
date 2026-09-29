/**
 * Measures the gap between live and final elevation gain (#53).
 *
 * The client smooths altitude with a TRAILING moving average (it can't see the future),
 * the server with a CENTRED one (it has the whole track). On chosen fixtures both agree;
 * on a real noisy track nothing guarantees it. This script puts a number on the gap to
 * decide: tolerate it, show the live value as provisional, or smooth on the client with
 * a delayed centred average.
 *
 * No copy of the server algorithm here: the final gain is the one the backend **stored**
 * on the activity, and the live gain is obtained by replaying the raw points through the
 * app's real `GpsAccumulator`, exactly as during the session.
 *
 * Input: one JSON file per session, `{ "activity": …, "trackPoints": [...] }`, as exported
 * by the two API GETs (see the procedure in #53).
 *
 * Usage (Node ≥ 23.6, which runs TypeScript without transpiling):
 *   node --no-warnings scripts/measure-elevation-drift.mts --max-kmh 25 flat.json hilly.json mountain.json
 *
 * `--max-kmh` is the plausibility threshold of the session's sport (the sport module's
 * `maxGpsSpeedKmh`): the script knows no sport, and rejects a batch of files mixing
 * several of them.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { GpsAccumulator } from '../src/core/session/metrics.ts';

interface ExportedPoint {
  seq: number;
  recordedAt: string;
  lat: number;
  lng: number;
  altitudeM: number | null;
  accuracyM: number | null;
}

interface ExportedSession {
  activity: { id: string; sportType: string; metrics?: { elevationGainM?: number; elevationLossM?: number } };
  trackPoints: ExportedPoint[];
}

function parseArgs(argv: string[]): { maxKmh: number; files: string[] } {
  const files: string[] = [];
  let maxKmh: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max-kmh') {
      maxKmh = Number(argv[++i]);
    } else {
      files.push(argv[i]);
    }
  }
  if (maxKmh == null || !Number.isFinite(maxKmh) || maxKmh <= 0 || files.length === 0) {
    console.error('Usage: node scripts/measure-elevation-drift.mts --max-kmh <threshold> <session.json>...');
    process.exit(2);
  }
  return { maxKmh, files };
}

const pct = (live: number, final: number) =>
  final === 0 ? (live === 0 ? '0 %' : 'n/a') : `${(((live - final) / final) * 100).toFixed(1)} %`;

const { maxKmh, files } = parseArgs(process.argv.slice(2));
const rows: string[][] = [['session', 'points', 'final D+', 'live D+', 'D+ gap', 'final D-', 'live D-', 'D- gap']];

const sessions = files.map((file) => ({
  file,
  session: JSON.parse(readFileSync(file, 'utf8')) as ExportedSession,
}));

/**
 * A single plausibility threshold per call: it belongs to the sport. Mixing sports would
 * apply one sport's filter to the other, and the measured gap would be worthless
 * (CodeRabbit review, PR #71). Better to refuse than to produce a wrong number.
 */
const sports = new Set(sessions.map(({ session }) => session.activity.sportType));
if (sports.size > 1) {
  console.error(
    `Sessions of different sports (${[...sports].join(', ')}): run one call per sport, ` +
      'each with its own --max-kmh.',
  );
  process.exit(2);
}

for (const { file, session } of sessions) {
  const acc = new GpsAccumulator(maxKmh);
  const points = [...session.trackPoints].sort((a, b) => a.seq - b.seq);
  for (const p of points) {
    acc.add({
      recordedAtMs: Date.parse(p.recordedAt),
      lat: p.lat,
      lng: p.lng,
      altitudeM: p.altitudeM,
      accuracyM: p.accuracyM,
    });
  }
  const finalGain = session.activity.metrics?.elevationGainM;
  const finalLoss = session.activity.metrics?.elevationLossM;
  if (finalGain == null || finalLoss == null) {
    console.error(`${file}: the activity carries no server D+/D- (session not closed?)`);
    process.exit(1);
  }
  // The server rounds to the metre (RunningPlugin/WalkingPlugin): compare with what's displayed.
  const liveGain = Math.round(acc.elevationGainM);
  const liveLoss = Math.round(acc.elevationLossM);
  rows.push([
    basename(file),
    String(points.length),
    `${finalGain} m`,
    `${liveGain} m`,
    `${liveGain - finalGain} m (${pct(liveGain, finalGain)})`,
    `${finalLoss} m`,
    `${liveLoss} m`,
    `${liveLoss - finalLoss} m (${pct(liveLoss, finalLoss)})`,
  ]);
}

const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
for (const r of rows) {
  console.log(r.map((cell, c) => cell.padEnd(widths[c])).join('  '));
}
