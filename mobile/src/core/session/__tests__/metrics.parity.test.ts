/**
 * Parité client/serveur du moteur GPS (#40).
 *
 * `core/session/metrics.ts` (affichage live) et `GpsComputations.java`
 * (source de vérité, recalcul au stop) doivent donner les MÊMES métriques sur
 * les MÊMES tracés. Sans ce garde-fou, une dérive silencieuse entre les deux
 * fausserait tout ce qui s'affiche pendant une séance sans qu'aucun test ne
 * bronche — c'est la raison d'être de ce fichier.
 *
 * Les valeurs attendues sortent de l'implémentation Java réelle
 * (cf. `support/gps-fixtures.ts`, JAVA_GOLDEN). Un test rouge ici veut dire
 * l'une de deux choses :
 *  - le backend a changé et le client n'a pas suivi (ou l'inverse) ;
 *  - la modification était volontaire, et JAVA_GOLDEN doit être régénéré
 *    depuis le backend — jamais ajusté à la main pour faire passer le test.
 *
 * DIFFÉRENCE STRUCTURELLE ASSUMÉE — le lissage d'altitude. Le serveur emploie
 * une moyenne mobile CENTRÉE (il voit tout le tracé) ; le client, incrémental,
 * ne peut lisser que sur les 5 derniers points (moyenne GLISSANTE). Les
 * fixtures ci-dessous sont choisies pour que les deux schémas produisent la
 * même séquence de deltas (plats, rampes monotones, marches, pic isolé) : la
 * parité porte donc sur les seuils et les formules, pas sur l'ordonnancement
 * de la fenêtre. Voir aussi #53.
 */
import { GpsAccumulator, MAX_ACCURACY_M, haversineM } from '../metrics';
import {
  JAVA_GOLDEN,
  cleanTrack,
  duplicateTimestampTrack,
  implausibleSpeedTrack,
  longTrack,
  noisyAltitudeTrack,
  poorAccuracyTrack,
  replay,
  steadyClimbTrack,
  steadyDescentTrack,
} from './support/gps-fixtures';

/** Tolérance au millimètre : assez fine pour repérer tout changement de
 *  formule ou de rayon terrestre, assez lâche pour les derniers bits de
 *  Math.sin entre la JVM et V8. */
const MM = 3;

describe('haversineM — même formule que GpsComputations.haversineM', () => {
  it('Paris → Lyon donne la distance du golden Java', () => {
    expect(haversineM(48.8566, 2.3522, 45.764, 4.8357)).toBeCloseTo(
      JAVA_GOLDEN.haversineParisLyonM,
      MM,
    );
  });

  it('reste dans les bornes du test Java (380–400 km)', () => {
    const d = haversineM(48.8566, 2.3522, 45.764, 4.8357);
    expect(d).toBeGreaterThan(380_000);
    expect(d).toBeLessThan(400_000);
  });

  it('un pas de 0,0001° de latitude vaut 11,119… m', () => {
    expect(haversineM(45.0, 5.0, 45.0001, 5.0)).toBeCloseTo(JAVA_GOLDEN.haversineOneStepM, MM);
  });

  it('est symétrique et nulle sur place', () => {
    expect(haversineM(45.0, 5.0, 45.0, 5.0)).toBe(0);
    expect(haversineM(45.0, 5.0, 45.01, 5.01)).toBeCloseTo(
      haversineM(45.01, 5.01, 45.0, 5.0),
      MM,
    );
  });
});

describe('distance — accumulation sur tracé propre', () => {
  it('100 points ≈ 1,1 km, à la valeur du golden Java près', () => {
    const { acc, acceptedCount } = replay(GpsAccumulator, cleanTrack);
    expect(acceptedCount).toBe(100);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.cleanTrackDistanceM, MM);
  });

  it('reste dans les bornes du test Java (1050–1150 m)', () => {
    const { acc } = replay(GpsAccumulator, cleanTrack);
    expect(acc.distanceM).toBeGreaterThan(1050);
    expect(acc.distanceM).toBeLessThan(1150);
  });

  it('200 points ≈ 2,2 km (jeu des splits serveur)', () => {
    const { acc } = replay(GpsAccumulator, longTrack);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.longTrackDistanceM, MM);
  });

  it('publie le tracé des points acceptés pour la carte', () => {
    const { acc } = replay(GpsAccumulator, cleanTrack);
    expect(acc.path).toHaveLength(100);
    expect(acc.path[0]).toEqual({ latitude: 45.0, longitude: 5.0 });
    expect(acc.lastAcceptedMs).toBe(cleanTrack[99].recordedAtMs);
  });
});

describe('filtres — mêmes points écartés que le serveur', () => {
  it('écarte le point imprécis et mesure la distance de part en part', () => {
    const { acc, accepted } = replay(GpsAccumulator, poorAccuracyTrack);
    expect(accepted).toEqual([true, false, true]);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.poorAccuracyDistanceM, MM);
    // Borne du test Java : le saut de 500 m ne doit pas entrer dans le total.
    expect(acc.distanceM).toBeLessThan(50);
  });

  it('écarte le segment à 600 km/h', () => {
    const { acc, accepted } = replay(GpsAccumulator, implausibleSpeedTrack);
    expect(accepted).toEqual([true, false, true]);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.implausibleSpeedDistanceM, MM);
    expect(acc.distanceM).toBeLessThan(50);
  });

  it('écarte un point non postérieur au précédent (seconds <= 0)', () => {
    const { acc, accepted } = replay(GpsAccumulator, duplicateTimestampTrack);
    expect(accepted).toEqual([true, false, true]);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.duplicateTimestampDistanceM, MM);
  });

  it('accepte un point sans précision connue (accuracyM null)', () => {
    const acc = new GpsAccumulator(25);
    expect(acc.add({ recordedAtMs: 0, lat: 45, lng: 5, altitudeM: null, accuracyM: null })).toBe(
      true,
    );
  });
});

describe('dénivelé — hystérésis et lissage alignés sur le serveur', () => {
  it('ignore le bruit GPS (oscillation ±0,8 m)', () => {
    const { acc } = replay(GpsAccumulator, noisyAltitudeTrack);
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.noisyAltitudeGainM, 6);
    expect(acc.elevationLossM).toBeCloseTo(0, 6);
    expect(acc.distanceM).toBeCloseTo(JAVA_GOLDEN.noisyAltitudeDistanceM, MM);
  });

  it('compte une vraie montée de 30 m comme le serveur', () => {
    const { acc } = replay(GpsAccumulator, steadyClimbTrack);
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.steadyClimbGainM, 6);
    expect(acc.elevationLossM).toBeCloseTo(JAVA_GOLDEN.steadyClimbLossM, 6);
    // Bornes du test Java : > 24 m et <= 30 m.
    expect(acc.elevationGainM).toBeGreaterThan(24);
    expect(acc.elevationGainM).toBeLessThanOrEqual(30);
  });

  it('compte une vraie descente de 30 m comme le serveur', () => {
    const { acc } = replay(GpsAccumulator, steadyDescentTrack);
    expect(acc.elevationLossM).toBeCloseTo(JAVA_GOLDEN.steadyDescentLossM, 6);
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.steadyDescentGainM, 6);
  });
});

describe('constantes partagées', () => {
  it('MAX_ACCURACY_M vaut 50 m, comme GpsComputations.MAX_ACCURACY_M', () => {
    expect(MAX_ACCURACY_M).toBe(50);
  });
});
