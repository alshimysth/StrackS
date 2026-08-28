/**
 * Dérivations du graphique de distance (#24).
 *
 * Ce qui est testé ici n'est pas de la mise en page mais des règles de dataviz :
 * l'ordre des séries et l'étiquetage des intervalles sont ce qui rend le
 * graphique honnête ou trompeur.
 */
import {
  bucketDistance,
  bucketLabel,
  seriesOrder,
  seriesTotal,
} from '../DistanceBarChart';
import type { TimelineBucket } from '../../../types/api';

function bucket(start: string, values: Record<string, number>): TimelineBucket {
  return {
    start,
    end: start,
    bySport: Object.entries(values).map(([sportType, distanceM]) => ({
      sportType,
      distanceM,
      sessions: 1,
      durationS: 1800,
    })),
  };
}

describe('bucketDistance', () => {
  it('somme tous les sports de l’intervalle', () => {
    expect(bucketDistance(bucket('2026-07-06T00:00:00.000Z', { running: 12000, walking: 3000 })))
      .toBe(15000);
  });

  it('vaut zéro sur un intervalle sans séance', () => {
    expect(bucketDistance(bucket('2026-07-06T00:00:00.000Z', {}))).toBe(0);
  });
});

describe('seriesOrder', () => {
  /**
   * Règle non négociable : la couleur suit le sport, jamais son rang. Si l'ordre
   * se recalculait par valeur à chaque colonne, les segments changeraient de
   * teinte d'une semaine à l'autre et le lecteur qui a appris « la marche est
   * verte » serait trompé.
   */
  it('fige l’ordre des séries sur tout le graphique, dans l’ordre d’apparition', () => {
    const buckets = [
      bucket('2026-07-06T00:00:00.000Z', { running: 12000, walking: 3000 }),
      // Semaine où la marche domine largement : l'ordre ne doit pas s'inverser.
      bucket('2026-07-13T00:00:00.000Z', { walking: 40000, running: 1000 }),
    ];
    expect(seriesOrder(buckets)).toEqual(['running', 'walking']);
  });

  it('ignore les sports présents mais à zéro', () => {
    const buckets = [bucket('2026-07-06T00:00:00.000Z', { running: 5000, walking: 0 })];
    expect(seriesOrder(buckets)).toEqual(['running']);
  });

  it('ne répète pas un sport vu plusieurs fois', () => {
    const buckets = [
      bucket('2026-07-06T00:00:00.000Z', { running: 5000 }),
      bucket('2026-07-13T00:00:00.000Z', { running: 6000 }),
    ];
    expect(seriesOrder(buckets)).toEqual(['running']);
  });
});

describe('seriesTotal', () => {
  it('totalise un sport sur toute la période — c’est le chiffre de la légende', () => {
    const buckets = [
      bucket('2026-07-06T00:00:00.000Z', { running: 12000, walking: 3000 }),
      bucket('2026-07-13T00:00:00.000Z', { running: 8000 }),
    ];
    expect(seriesTotal(buckets, 'running')).toBe(20000);
    expect(seriesTotal(buckets, 'walking')).toBe(3000);
    expect(seriesTotal(buckets, 'climbing')).toBe(0);
  });
});

describe('bucketLabel', () => {
  /**
   * Le serveur renvoie la borne d'un intervalle comme l'instant de **minuit
   * local** — il découpe dans le fuseau que le client lui a envoyé. La fixture
   * doit donc être construite en heure locale : un « minuit UTC » écrit en dur
   * désignerait la veille au soir pour tout fuseau à l'ouest de Greenwich, et le
   * test ne passerait qu'à Londres.
   */
  const localMidnight = (year: number, month: number, day: number) =>
    new Date(year, month, day).toISOString();

  it('étiquette une semaine par le jour de son lundi', () => {
    // 2026-06-29 est le lundi de la semaine à cheval sur juin et juillet —
    // celle que la maquette étiquette « 29/6 » en tête d'un mois de juillet.
    expect(bucketLabel(bucket(localMidnight(2026, 5, 29), {}), 'week')).toBe('29/6');
  });

  it('donne une étiquette courte au jour et au mois', () => {
    expect(bucketLabel(bucket(localMidnight(2026, 6, 15), {}), 'day')).toHaveLength(1);
    expect(bucketLabel(bucket(localMidnight(2026, 6, 15), {}), 'month').length)
      .toBeLessThanOrEqual(4);
  });
});
