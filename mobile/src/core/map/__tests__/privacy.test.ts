/** #37 : ce que la carte dessine autour d'une zone de confidentialité. */
import { maskRoute, type MapPoint } from '../privacy';
import type { PrivacyZone } from '../../preferences/schema';

const DEG_PER_M = 1 / 111_195; // ≈ 1 m de latitude

/** Tracé plein nord depuis (45, 5), un point tous les 50 m. */
function northTrack(points: number): MapPoint[] {
  return Array.from({ length: points }, (_, i) => ({ latitude: 45 + i * 50 * DEG_PER_M, longitude: 5 }));
}

const home: PrivacyZone = { lat: 45, lng: 5, radiusM: 200, label: 'Domicile' };

it('ne change rien sans zone', () => {
  const track = northTrack(10);
  expect(maskRoute(track, [])).toEqual({ segments: [track], hiddenPoints: 0 });
});

it('retire les points du départ situés dans la zone', () => {
  const masked = maskRoute(northTrack(20), [home]);
  expect(masked.hiddenPoints).toBe(5); // 0, 50, 100, 150, 200 m
  expect(masked.segments).toHaveLength(1);
  expect(masked.segments[0][0].latitude).toBeCloseTo(45 + 250 * DEG_PER_M, 9);
});

/** Un aller-retour qui repasse devant la maison : deux portions, jamais reliées à travers. */
it('coupe le tracé en portions distinctes quand il traverse une zone', () => {
  const out = northTrack(10); // 0 → 450 m
  const through = [...[...out].reverse(), ...out.slice(1).map((p) => ({ ...p, latitude: 2 * 45 - p.latitude }))];
  // 450 m au nord → maison → 450 m au sud : la zone est au milieu du tracé.
  const masked = maskRoute(through, [home]);
  expect(masked.segments).toHaveLength(2);
  for (const segment of masked.segments) {
    for (const point of segment) {
      expect(Math.abs(point.latitude - 45) / DEG_PER_M).toBeGreaterThan(200);
    }
  }
});

it('rend une liste vide quand tout le tracé est dans la zone', () => {
  const masked = maskRoute(northTrack(3), [{ ...home, radiusM: 500 }]);
  expect(masked).toEqual({ segments: [], hiddenPoints: 3 });
});

it('applique plusieurs zones', () => {
  // Bureau à 900 m, rayon 60 m : masque 850, 900 et 950 m, aucun point sur la frontière.
  const office: PrivacyZone = { lat: 45 + 900 * DEG_PER_M, lng: 5, radiusM: 60, label: null };
  const masked = maskRoute(northTrack(25), [home, office]); // 0 → 1200 m
  expect(masked.hiddenPoints).toBe(5 + 3);
  expect(masked.segments).toHaveLength(2);
});
