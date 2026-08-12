/**
 * Sondes de seuils du moteur GPS client (#40).
 *
 * `metrics.ts` garde trois constantes privées qu'aucun type ne protège :
 * précision max 50 m, hystérésis de dénivelé 2 m, lissage sur 5 points.
 * Chaque test ci-dessous est construit pour BASCULER si l'une de ces valeurs
 * bouge — un seuil modifié d'un cheveu fait tomber un test nommé d'après lui,
 * plutôt que de fausser silencieusement l'affichage d'une séance.
 *
 * Les valeurs attendues sont celles de l'implémentation Java (JAVA_GOLDEN) :
 * les sondes sont choisies pour donner le même résultat sous le lissage
 * centré du serveur et le lissage glissant du client.
 */
import { GpsAccumulator } from '../metrics';
import {
  DEG_PER_M,
  JAVA_GOLDEN,
  MAX_SPEED_KMH,
  altitudeStepTrack,
  fix,
  loneSpikeTrack,
  replay,
  twoPointSegment,
} from './support/gps-fixtures';

describe('seuil de précision — 50 m', () => {
  it('accepte un point à exactement 50 m de précision', () => {
    const acc = new GpsAccumulator(MAX_SPEED_KMH);
    expect(acc.add(fix(0, 45.0, { accuracyM: 50 }))).toBe(true);
  });

  it('écarte un point juste au-delà de 50 m', () => {
    const acc = new GpsAccumulator(MAX_SPEED_KMH);
    expect(acc.add(fix(0, 45.0, { accuracyM: 50.000001 }))).toBe(false);
  });

  it('écarte tout point médiocre sans casser la mesure du tracé', () => {
    // 20 m en 6 s : plausible. Seule la précision décide ici.
    const track = [fix(0, 45.0), fix(1, 45.00018, { accuracyM: 51 }), fix(2, 45.00036)];
    const { accepted } = replay(GpsAccumulator, track);
    expect(accepted).toEqual([true, false, true]);
  });
});

describe('hystérésis de dénivelé — 2 m', () => {
  it("n'accumule rien pour un palier de 1,9 m", () => {
    const { acc } = replay(GpsAccumulator, altitudeStepTrack(1.9));
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.altitudeStep19GainM, 6);
    expect(acc.elevationGainM).toBe(0);
  });

  it('accumule un palier de 2,0 m, pile au seuil', () => {
    const { acc } = replay(GpsAccumulator, altitudeStepTrack(2));
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.altitudeStep20GainM, 6);
  });

  it('compte en descente un palier négatif de 2,0 m', () => {
    const { acc } = replay(GpsAccumulator, altitudeStepTrack(-2));
    expect(acc.elevationLossM).toBeCloseTo(JAVA_GOLDEN.altitudeStep20GainM, 6);
    expect(acc.elevationGainM).toBe(0);
  });

  it('ignore un aller-retour sous le seuil, quel que soit le nombre de cycles', () => {
    const track = Array.from({ length: 120 }, (_, i) =>
      fix(i, 45.0 + i * 0.0001, { altitudeM: 200 + (i % 2 === 0 ? 0.9 : -0.9) }),
    );
    const { acc } = replay(GpsAccumulator, track);
    expect(acc.elevationGainM).toBe(0);
    expect(acc.elevationLossM).toBe(0);
  });
});

describe('fenêtre de lissage — 5 points', () => {
  it('atténue un pic isolé de 11 m à 11/5 = 2,2 m', () => {
    // Empreinte de la largeur de fenêtre : 5 points → 2,2 m (au-dessus de
    // l'hystérésis, donc compté) ; 4 points → 2,75 m ; 6 points → 1,83 m,
    // sous le seuil, donc D+ nul. Les trois cas sont distinguables.
    const { acc } = replay(GpsAccumulator, loneSpikeTrack(11));
    expect(acc.elevationGainM).toBeCloseTo(JAVA_GOLDEN.loneSpike11GainM, 6);
    expect(acc.elevationLossM).toBeCloseTo(JAVA_GOLDEN.loneSpike11LossM, 6);
  });

  it('absorbe complètement un pic isolé de 9 m (9/5 = 1,8 < 2)', () => {
    const { acc } = replay(GpsAccumulator, loneSpikeTrack(9));
    expect(acc.elevationGainM).toBe(0);
    expect(acc.elevationLossM).toBe(0);
  });

  it('ne prend en compte que les points porteurs d\'altitude', () => {
    // Altitude absente : le point compte pour la distance, pas pour le lissage.
    const track = [
      ...Array.from({ length: 10 }, (_, i) => fix(i, 45.0 + i * 0.0001)),
      ...Array.from({ length: 10 }, (_, i) => fix(10 + i, 45.001 + i * 0.0001, { altitudeM: null })),
    ];
    const { acc, acceptedCount } = replay(GpsAccumulator, track);
    expect(acceptedCount).toBe(20);
    expect(acc.elevationGainM).toBe(0);
  });
});

describe('plausibilité de vitesse — conversion km/h → m/s', () => {
  it('accepte un segment juste sous la vitesse max', () => {
    const maxSpeedMs = MAX_SPEED_KMH / 3.6;
    const { accepted } = replay(GpsAccumulator, twoPointSegment(2, maxSpeedMs * 0.999));
    expect(accepted).toEqual([true, true]);
  });

  it('écarte un segment juste au-dessus de la vitesse max', () => {
    const maxSpeedMs = MAX_SPEED_KMH / 3.6;
    const { accepted } = replay(GpsAccumulator, twoPointSegment(2, maxSpeedMs * 1.001));
    expect(accepted).toEqual([true, false]);
  });

  it('interprète bien maxSpeedKmh en km/h et non en m/s', () => {
    // 36 km/h = 10 m/s pile : la sonde tombe si le /3.6 disparaît ou change.
    expect(replay(GpsAccumulator, twoPointSegment(2, 9.9), 36).accepted).toEqual([true, true]);
    expect(replay(GpsAccumulator, twoPointSegment(2, 10.1), 36).accepted).toEqual([true, false]);
  });

  it('applique le plafond propre à chaque sport (marche plus strict que course)', () => {
    // 4 m/s = 14,4 km/h : plausible en courant, pas en marchant.
    expect(replay(GpsAccumulator, twoPointSegment(2, 4), 25).accepted).toEqual([true, true]);
    expect(replay(GpsAccumulator, twoPointSegment(2, 4), 10).accepted).toEqual([true, false]);
  });
});

describe('vitesse lissée — spécifique au client (le serveur calcule des splits)', () => {
  it('reste nulle tant que la fenêtre est plus courte que 3 s', () => {
    const acc = new GpsAccumulator(MAX_SPEED_KMH);
    acc.add(fix(0, 45.0, { atMs: 0 }));
    expect(acc.smoothedSpeedMs).toBe(0);
    // Deuxième point 2 s plus tard : fenêtre de 2 s, sous le seuil.
    acc.add(fix(1, 45.0002, { atMs: 2000 }));
    expect(acc.smoothedSpeedMs).toBe(0);
  });

  it('calcule la vitesse dès que la fenêtre dépasse 3 s', () => {
    const acc = new GpsAccumulator(MAX_SPEED_KMH);
    acc.add(fix(0, 45.0, { atMs: 0 }));
    acc.add(fix(1, 45.0 + 20 * DEG_PER_M, { atMs: 4000 })); // 20 m en 4 s = 5 m/s
    expect(acc.smoothedSpeedMs).toBeCloseTo(5, 3);
  });

  it('ne lisse que sur les 15 dernières secondes', () => {
    const acc = new GpsAccumulator(MAX_SPEED_KMH);
    // 30 points à 1 s d'intervalle : 2 m/s pendant 15 s, puis 6 m/s.
    for (let i = 0; i < 15; i++) {
      acc.add(fix(i, 45.0 + i * 2 * DEG_PER_M, { atMs: i * 1000 }));
    }
    expect(acc.smoothedSpeedMs).toBeCloseTo(2, 2);

    const lastSlowLat = 45.0 + 14 * 2 * DEG_PER_M;
    for (let i = 0; i < 15; i++) {
      acc.add(fix(15 + i, lastSlowLat + (i + 1) * 6 * DEG_PER_M, { atMs: (15 + i) * 1000 }));
    }
    // La portion lente est sortie de la fenêtre : seule la rapide compte.
    expect(acc.smoothedSpeedMs).toBeCloseTo(6, 2);
  });

  it('publie un instantané complet pour l\'UI', () => {
    const { acc } = replay(GpsAccumulator, altitudeStepTrack(2));
    expect(acc.snapshot(123)).toEqual({
      elapsedS: 123,
      distanceM: acc.distanceM,
      elevationGainM: acc.elevationGainM,
      elevationLossM: acc.elevationLossM,
      smoothedSpeedMs: acc.smoothedSpeedMs,
    });
  });
});
