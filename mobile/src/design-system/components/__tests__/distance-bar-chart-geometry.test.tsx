/**
 * Géométrie du graphique (#24).
 *
 * Le rendu ne pouvant pas être inspecté à l'œil dans la CI, ce sont ces
 * invariants qui tiennent lieu de contrôle visuel — et ils tiennent mieux dans
 * le temps qu'une capture d'écran : une barre plus haute que le tracé, une pile
 * dont les segments débordent, ou une petite valeur écrasée à zéro sont des
 * défauts mesurables.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { DistanceBarChart } from '../DistanceBarChart';
import type { StatsTimeline, TimelineBucket } from '../../../types/api';

const PLOT_HEIGHT = 158;
const SEGMENT_GAP = 2;
const MIN_VISIBLE_HEIGHT = 3;

const LABELS = { running: 'Course à pied', walking: 'Marche' };

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

function timelineOf(buckets: TimelineBucket[]): StatsTimeline {
  return { from: buckets[0].start, to: buckets[0].start, bucket: 'week', buckets };
}

/** Hauteur effective d'un élément, styles aplatis. */
function heightOf(testID: string): number {
  const style = StyleSheet.flatten(screen.getByTestId(testID).props.style) as { height?: number };
  return style.height ?? 0;
}

const localMidnight = (d: number) => new Date(2026, 6, d).toISOString();

describe('géométrie du graphique', () => {
  it('donne toute la hauteur du tracé à l’intervalle le plus fort, et jamais plus', async () => {
    await render(
      <DistanceBarChart
        timeline={timelineOf([
          bucket(localMidnight(6), { running: 10_000 }),
          bucket(localMidnight(13), { running: 40_000 }),
          bucket(localMidnight(20), { running: 20_000 }),
        ])}
        labels={LABELS}
      />,
    );

    expect(heightOf('chart-stack-1')).toBeCloseTo(PLOT_HEIGHT);
    expect(heightOf('chart-stack-0')).toBeCloseTo(PLOT_HEIGHT / 4);
    expect(heightOf('chart-stack-2')).toBeCloseTo(PLOT_HEIGHT / 2);
  });

  /**
   * Les écarts sont pris SUR la hauteur utile, pas ajoutés par-dessus : sinon
   * une colonne à deux sports dépasserait une colonne à un sport de même valeur,
   * et le graphique mentirait sur l'ordre des semaines.
   */
  it('ne fait pas dépasser une pile à cause de ses écarts', async () => {
    await render(
      <DistanceBarChart
        timeline={timelineOf([
          bucket(localMidnight(6), { running: 30_000, walking: 10_000 }),
          bucket(localMidnight(13), { running: 40_000 }),
        ])}
        labels={LABELS}
      />,
    );

    // Deux colonnes de même total : même hauteur, malgré l'écart interne.
    expect(heightOf('chart-stack-0')).toBeCloseTo(heightOf('chart-stack-1'));
    expect(heightOf('chart-stack-0')).toBeCloseTo(PLOT_HEIGHT);

    const segments =
      heightOf('chart-stack-0-running') + heightOf('chart-stack-0-walking') + SEGMENT_GAP;
    expect(segments).toBeCloseTo(PLOT_HEIGHT);
  });

  /**
   * Une sortie de 300 m dans un mois à 40 km ferait moins d'un pixel : une barre
   * invisible se lirait « aucune séance », ce qui est faux.
   */
  it('garde visible une valeur minuscule sans la confondre avec zéro', async () => {
    await render(
      <DistanceBarChart
        timeline={timelineOf([
          bucket(localMidnight(6), { running: 40_000 }),
          bucket(localMidnight(13), { running: 300 }),
          bucket(localMidnight(20), {}),
        ])}
        labels={LABELS}
      />,
    );

    expect(heightOf('chart-stack-1')).toBeGreaterThanOrEqual(MIN_VISIBLE_HEIGHT);
    // …et l'intervalle réellement vide reste un filet, pas une barre.
    expect(screen.queryByTestId('chart-stack-2')).toBeNull();
    expect(screen.getByTestId('chart-stack-2-zero')).toBeOnTheScreen();
  });

  it('ne rend rien de trompeur quand toute la période est à zéro', async () => {
    await render(
      <DistanceBarChart
        timeline={timelineOf([bucket(localMidnight(6), {}), bucket(localMidnight(13), {})])}
        labels={LABELS}
      />,
    );

    expect(screen.queryByTestId('distance-chart')).toBeNull();
    expect(screen.getByText('Aucune distance enregistrée sur cette période.')).toBeOnTheScreen();
  });

  /** La légende est toujours là dès deux séries — l'identité ne tient jamais à la seule couleur. */
  it('chiffre chaque série dans la légende', async () => {
    await render(
      <DistanceBarChart
        timeline={timelineOf([bucket(localMidnight(6), { running: 12_000, walking: 3_000 })])}
        labels={LABELS}
      />,
    );

    expect(screen.getByText('Course à pied · 12,00 km')).toBeOnTheScreen();
    expect(screen.getByText('Marche · 3,00 km')).toBeOnTheScreen();
  });
});
