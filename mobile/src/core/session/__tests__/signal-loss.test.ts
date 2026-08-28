/**
 * Perte de signal GPS (#19) — le comportement de la distance pendant et après le trou.
 *
 * DoD : « une traversée de tunnel ne produit ni saut de distance ni allure absurde ».
 * Le piège que ces tests verrouillent : le filtre de plausibilité **ne suffit pas**.
 * Un kilomètre franchi en cinq minutes de tunnel donne 12 km/h, parfaitement plausible
 * pour un coureur — le segment passe le filtre et ajoute une corde jamais parcourue.
 */
import { GpsAccumulator, SIGNAL_LOST_MS } from '../metrics';
import type { GpsFix } from '../../gps';

const T0 = Date.parse('2026-08-21T08:00:00.000Z');

function fix(atMs: number, lat: number, lng = 5.0): GpsFix {
  return { recordedAtMs: atMs, lat, lng, altitudeM: 200, accuracyM: 5 };
}

/**
 * ~55 m par 0,0005° de latitude. Pas volontairement court : parcouru en 14 s il donne
 * 14 km/h, sous le seuil de plausibilité course (25 km/h). Un pas plus long ferait
 * rejeter le point par le filtre et testerait autre chose que ce qu'on croit.
 */
const STEP_DEG = 0.0005;

describe('trou de signal et distance', () => {
  it('compte normalement un segment sous le seuil', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    acc.add(fix(T0 + SIGNAL_LOST_MS - 1000, 45.0 + STEP_DEG));

    expect(acc.distanceM).toBeGreaterThan(50);
  });

  /**
   * Le cœur du ticket : au-delà du seuil, le segment n'est PAS compté. On ignore quel
   * chemin a été suivi — le ticket tranche « pas d'interpolation par défaut ».
   */
  it('ne compte pas le segment qui enjambe le trou', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    acc.add(fix(T0 + SIGNAL_LOST_MS + 1000, 45.0 + STEP_DEG));

    expect(acc.distanceM).toBe(0);
  });

  /** Le point de reprise rouvre le tracé : il est accepté, il entre dans le path. */
  it('accepte quand même le point de reprise', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    const accepted = acc.add(fix(T0 + SIGNAL_LOST_MS + 1000, 45.0 + STEP_DEG));

    expect(accepted).toBe(true);
    expect(acc.path).toHaveLength(2);
  });

  /** Après la reprise, on recompte normalement — le trou n'empoisonne pas la suite. */
  it('reprend le comptage après le trou', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    acc.add(fix(T0 + SIGNAL_LOST_MS + 1000, 45.0 + STEP_DEG));
    const afterGap = acc.distanceM;
    acc.add(fix(T0 + SIGNAL_LOST_MS + 15_000, 45.0 + 2 * STEP_DEG));

    expect(afterGap).toBe(0);
    expect(acc.distanceM).toBeGreaterThan(50);
  });

  /**
   * Le scénario réel du ticket, chiffré : 5 minutes de tunnel, ~1,1 km à vol d'oiseau.
   * Vitesse apparente 13 km/h — sous le seuil de plausibilité de 25 km/h, donc le filtre
   * laisse passer. Sans la règle de trou, cette distance serait comptée.
   */
  it('n’ajoute rien sur une traversée de tunnel plausible mais non parcourue', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    acc.add(fix(T0 + 300_000, 45.01)); // 5 min plus tard, ~1,1 km plus au nord

    expect(acc.distanceM).toBe(0);
    expect(acc.snapshot(300).smoothedSpeedMs).toBe(0);
  });

  /** Le seuil est une frontière franche : exactement à la limite, on ne compte plus. */
  it('exclut le segment exactement au seuil', () => {
    const acc = new GpsAccumulator(25);
    acc.add(fix(T0, 45.0));
    acc.add(fix(T0 + SIGNAL_LOST_MS, 45.0 + STEP_DEG));

    expect(acc.distanceM).toBe(0);
  });
});
