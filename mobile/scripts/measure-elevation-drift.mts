/**
 * Mesure de l'écart D+ live / D+ final (#53).
 *
 * Le client lisse l'altitude par moyenne GLISSANTE (il ne voit pas l'avenir), le
 * serveur par moyenne CENTRÉE (il a tout le tracé). Sur des fixtures choisies les deux
 * coïncident ; sur une trace réelle bruitée, rien ne le garantit. Ce script chiffre
 * l'écart pour trancher : tolérer, afficher le live comme provisoire, ou lisser le
 * client de façon centrée retardée.
 *
 * Aucune copie de l'algorithme serveur ici : le D+ final est celui que le backend a
 * **stocké** sur l'activité, et le D+ live est obtenu en rejouant les points bruts dans
 * le vrai `GpsAccumulator` de l'app, exactement comme pendant la séance.
 *
 * Entrée : un fichier JSON par séance, `{ "activity": …, "trackPoints": [...] }`, tel
 * qu'exporté par les deux GET de l'API (voir la procédure dans #53).
 *
 * Usage (Node ≥ 23.6, qui exécute le TypeScript sans transpilation) :
 *   node --no-warnings scripts/measure-elevation-drift.mts --max-kmh 25 plat.json vallonne.json montagne.json
 *
 * `--max-kmh` est le seuil de plausibilité du sport de la séance (celui du module de
 * sport, `maxGpsSpeedKmh`) : le script ne connaît aucun sport, et refuse un lot de
 * fichiers qui en mélange plusieurs.
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
    console.error('Usage : node scripts/measure-elevation-drift.mts --max-kmh <seuil> <séance.json>...');
    process.exit(2);
  }
  return { maxKmh, files };
}

const pct = (live: number, final: number) =>
  final === 0 ? (live === 0 ? '0 %' : 'n/a') : `${(((live - final) / final) * 100).toFixed(1)} %`;

const { maxKmh, files } = parseArgs(process.argv.slice(2));
const rows: string[][] = [['séance', 'points', 'D+ final', 'D+ live', 'écart D+', 'D- final', 'D- live', 'écart D-']];

const sessions = files.map((file) => ({
  file,
  session: JSON.parse(readFileSync(file, 'utf8')) as ExportedSession,
}));

/**
 * Un seul seuil de plausibilité par appel : il appartient au sport. Mélanger des sports
 * appliquerait à l'un le filtre de l'autre, et l'écart mesuré ne vaudrait rien
 * (revue CodeRabbit, PR #71). On refuse plutôt que de produire un chiffre faux.
 */
const sports = new Set(sessions.map(({ session }) => session.activity.sportType));
if (sports.size > 1) {
  console.error(
    `Séances de sports différents (${[...sports].join(', ')}) : lance un appel par sport, ` +
      'chacun avec son --max-kmh.',
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
    console.error(`${file} : l'activité ne porte pas de D+/D- serveur (séance non close ?)`);
    process.exit(1);
  }
  // Le serveur arrondit au mètre (RunningPlugin/WalkingPlugin) : on compare à l'affiché.
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
