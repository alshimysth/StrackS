/**
 * Jeux de données GPS partagés avec le backend — MÊMES tracés que
 * `backend/src/test/java/com/stracks/core/activity/GpsComputationsTest.java`.
 *
 * `metrics.ts` est le miroir client de `GpsComputations.java` : ces fixtures
 * existent pour qu'une divergence de seuil ou de formule entre les deux
 * implémentations fasse échouer un test côté mobile (#40).
 *
 * Les valeurs attendues (`JAVA_GOLDEN`) ne sont pas recopiées à la main :
 * elles sortent de l'implémentation Java réelle, exécutée sur ces mêmes
 * tracés. Pour les régénérer après un changement volontaire du backend :
 *
 *   cd backend && ./mvnw -q compile
 *   jshell --class-path "target/classes:target/quarkus-app/lib/main/*"
 *   # puis instancier des TrackPointEntity avec les tracés ci-dessous et
 *   # appeler GpsComputations.compute(track, 25.0)
 */
import type { GpsFix } from '../../../gps';

/** Horodatage de base fixe : les tracés doivent être reproductibles. */
export const T0_MS = Date.parse('2026-08-11T08:00:00Z');

/** Vitesse max de plausibilité utilisée par le test Java (course). */
export const MAX_SPEED_KMH = 25;

/**
 * Le long d'un méridien la haversine est linéaire : 0,0001° de latitude
 * valent 11,119492664825003 m (valeur mesurée sur l'implémentation Java).
 * Sert à placer un point à une distance voulue au mètre près.
 */
export const M_PER_1E4_DEG = 11.119492664825003;
export const DEG_PER_M = 0.0001 / M_PER_1E4_DEG;

export function fix(
  index: number,
  lat: number,
  options: { lng?: number; altitudeM?: number | null; accuracyM?: number | null; atMs?: number } = {},
): GpsFix {
  return {
    recordedAtMs: options.atMs ?? T0_MS + index * 6000,
    lat,
    lng: options.lng ?? 5.0,
    altitudeM: options.altitudeM === undefined ? 200 : options.altitudeM,
    accuracyM: options.accuracyM === undefined ? 5 : options.accuracyM,
  };
}

/** Tracé propre de 100 points, ~11,1 m par pas → ~1,1 km. */
export const cleanTrack: GpsFix[] = Array.from({ length: 100 }, (_, i) =>
  fix(i, 45.0 + i * 0.0001),
);

/** Tracé de 200 points (~2,2 km) — jeu des splits côté serveur. */
export const longTrack: GpsFix[] = Array.from({ length: 200 }, (_, i) =>
  fix(i, 45.0 + i * 0.0001),
);

/** Point aberrant au milieu : saut de 500 m avec une précision de 120 m. */
export const poorAccuracyTrack: GpsFix[] = [
  fix(0, 45.0),
  fix(1, 45.005, { accuracyM: 120 }),
  fix(2, 45.0002),
];

/** Saut de 1 km en 6 s = 600 km/h : impossible en courant. */
export const implausibleSpeedTrack: GpsFix[] = [fix(0, 45.0), fix(1, 45.009), fix(2, 45.0001)];

/** Oscillation ±0,8 m autour de 200 m : que du bruit, D+ attendu nul. */
export const noisyAltitudeTrack: GpsFix[] = Array.from({ length: 60 }, (_, i) =>
  fix(i, 45.0 + i * 0.0001, { altitudeM: 200 + (i % 2 === 0 ? 0.8 : -0.8) }),
);

/** Montée régulière de 30 m sur 60 points. */
export const steadyClimbTrack: GpsFix[] = Array.from({ length: 60 }, (_, i) =>
  fix(i, 45.0 + i * 0.0001, { altitudeM: 200 + i * 0.5 }),
);

/** Descente régulière de 30 m sur 60 points. */
export const steadyDescentTrack: GpsFix[] = Array.from({ length: 60 }, (_, i) =>
  fix(i, 45.0 + i * 0.0001, { altitudeM: 200 - i * 0.5 }),
);

/** Deux points au même horodatage : le segment doit être écarté. */
export const duplicateTimestampTrack: GpsFix[] = [
  fix(0, 45.0),
  fix(1, 45.0001, { atMs: T0_MS }),
  fix(2, 45.0002),
];

/**
 * Palier d'altitude de `stepM` après 20 points plats, puis 20 points au
 * nouveau palier. Le lissage sur 5 points étale la marche : le delta maximal
 * vu par l'hystérésis vaut exactement `stepM`, ce qui en fait une sonde
 * propre du seuil de 2 m — et ce, pour les DEUX schémas de lissage
 * (glissant côté client, centré côté serveur : même séquence de deltas).
 */
export function altitudeStepTrack(stepM: number): GpsFix[] {
  return Array.from({ length: 40 }, (_, i) =>
    fix(i, 45.0 + i * 0.0001, { altitudeM: 200 + (i < 20 ? 0 : stepM) }),
  );
}

/**
 * Pic d'altitude isolé sur un seul point. Le lissage sur 5 points l'atténue à
 * `spikeM / 5` : la valeur du D+ obtenu est une empreinte directe de la
 * largeur de fenêtre (11 m → 2,2 m avec 5 points, 2,75 m avec 4, rien avec 6).
 */
export function loneSpikeTrack(spikeM: number): GpsFix[] {
  return Array.from({ length: 40 }, (_, i) =>
    fix(i, 45.0 + i * 0.0001, { altitudeM: 200 + (i === 20 ? spikeM : 0) }),
  );
}

/**
 * Deux points séparés de `seconds`, distants de la longueur qu'impose
 * `speedMs`. Sonde du filtre de plausibilité.
 */
export function twoPointSegment(seconds: number, speedMs: number): GpsFix[] {
  const distanceM = speedMs * seconds;
  return [
    fix(0, 45.0),
    fix(1, 45.0 + distanceM * DEG_PER_M, { atMs: T0_MS + seconds * 1000 }),
  ];
}

/**
 * Résultats de `GpsComputations.compute(track, 25.0)` — implémentation Java
 * réelle (backend @ 7cde637), capturés via jshell sur `target/classes`.
 * Toute modification de ces nombres doit venir d'un changement assumé du
 * moteur backend, jamais d'un ajustement pour « faire passer » le test.
 */
export const JAVA_GOLDEN = {
  haversineParisLyonM: 391498.9316742573,
  haversineOneStepM: 11.119492664825003,
  cleanTrackDistanceM: 1100.8297737813316,
  longTrackDistanceM: 2212.779040226695,
  poorAccuracyDistanceM: 22.23898532885992,
  implausibleSpeedDistanceM: 11.119492664825003,
  duplicateTimestampDistanceM: 22.23898532885992,
  noisyAltitudeDistanceM: 656.050067202553,
  noisyAltitudeGainM: 0,
  steadyClimbGainM: 28,
  steadyClimbLossM: 0,
  steadyDescentGainM: 0,
  steadyDescentLossM: 28,
  /** Palier de 1,9 m : sous l'hystérésis de 2 m → rien accumulé. */
  altitudeStep19GainM: 0,
  /** Palier de 2,0 m : pile au seuil → accumulé. */
  altitudeStep20GainM: 2,
  /** Pic isolé de 11 m lissé sur 5 points → 2,2 m en montée puis en descente. */
  loneSpike11GainM: 2.1999999999999886,
  loneSpike11LossM: 2.1999999999999886,
} as const;

/** Rejoue un tracé dans l'accumulateur client et renvoie l'état obtenu. */
export function replay(
  Accumulator: typeof import('../../metrics').GpsAccumulator,
  track: GpsFix[],
  maxSpeedKmh: number = MAX_SPEED_KMH,
) {
  const acc = new Accumulator(maxSpeedKmh);
  const accepted: boolean[] = [];
  for (const point of track) {
    accepted.push(acc.add(point));
  }
  return {
    acc,
    accepted,
    acceptedCount: accepted.filter(Boolean).length,
    rejectedCount: accepted.filter((ok) => !ok).length,
  };
}
