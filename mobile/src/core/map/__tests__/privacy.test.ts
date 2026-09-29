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

/**
 * Revue PR #80 : points espacés de part et d'autre de la zone, aucun à l'intérieur.
 * Sans découpe, la ligne droite entre eux traverserait le domicile.
 */
it('coupe un segment qui traverse une zone sans qu’aucun point n’y tombe', () => {
  const south = { latitude: 45 - 400 * DEG_PER_M, longitude: 5 };
  const north = { latitude: 45 + 400 * DEG_PER_M, longitude: 5 };
  const masked = maskRoute([south, north], [home]);
  expect(masked.hiddenPoints).toBe(0);
  expect(masked.segments).toEqual([[south], [north]]);
});

it('ne coupe pas un segment qui passe à côté de la zone', () => {
  const west = { latitude: 45, longitude: 5 - 0.01 };
  const farNorth = { latitude: 45 + 400 * DEG_PER_M, longitude: 5 - 0.01 };
  expect(maskRoute([west, farNorth], [home]).segments).toEqual([[west, farNorth]]);
});


describe('centre décalé (revue PR #80)', () => {
  const { jitteredCenter, CENTER_JITTER_RATIO } = jest.requireActual('../privacy');
  const { haversineM } = jest.requireActual('../../session/metrics');

  it('ne stocke pas la position réelle comme centre', () => {
    const c = jitteredCenter(48.8566, 2.3522, 500, () => 0.5);
    expect(haversineM(48.8566, 2.3522, c.lat, c.lng)).toBeGreaterThan(50);
  });

  it('couvre toujours la position réelle avec une marge d’au moins 70 % du rayon', () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 500; i++) {
      const c = jitteredCenter(48.8566, 2.3522, 500, random);
      const offset = haversineM(48.8566, 2.3522, c.lat, c.lng);
      expect(offset).toBeLessThanOrEqual(CENTER_JITTER_RATIO * 500 + 0.5);
    }
  });
});
