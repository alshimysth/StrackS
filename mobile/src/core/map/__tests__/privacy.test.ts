/** #37: what the map draws around a privacy zone. */
import { maskRoute, type MapPoint } from '../privacy';
import type { PrivacyZone } from '../../preferences/schema';

const DEG_PER_M = 1 / 111_195; // ≈ 1 m of latitude

/** Track heading due north from (45, 5), one point every 50 m. */
function northTrack(points: number): MapPoint[] {
  return Array.from({ length: points }, (_, i) => ({ latitude: 45 + i * 50 * DEG_PER_M, longitude: 5 }));
}

const home: PrivacyZone = { lat: 45, lng: 5, radiusM: 200, label: 'Domicile' };

it('changes nothing without a zone', () => {
  const track = northTrack(10);
  expect(maskRoute(track, [])).toEqual({ segments: [track], hiddenPoints: 0 });
});

it('removes the start points located in the zone', () => {
  const masked = maskRoute(northTrack(20), [home]);
  expect(masked.hiddenPoints).toBe(5); // 0, 50, 100, 150, 200 m
  expect(masked.segments).toHaveLength(1);
  expect(masked.segments[0][0].latitude).toBeCloseTo(45 + 250 * DEG_PER_M, 9);
});

/** A round trip passing by the house again: two portions, never joined across. */
it('cuts the track into separate portions when it crosses a zone', () => {
  const out = northTrack(10); // 0 → 450 m
  const through = [...[...out].reverse(), ...out.slice(1).map((p) => ({ ...p, latitude: 2 * 45 - p.latitude }))];
  // 450 m north → house → 450 m south: the zone is in the middle of the track.
  const masked = maskRoute(through, [home]);
  expect(masked.segments).toHaveLength(2);
  for (const segment of masked.segments) {
    for (const point of segment) {
      expect(Math.abs(point.latitude - 45) / DEG_PER_M).toBeGreaterThan(200);
    }
  }
});

it('returns an empty list when the whole track is in the zone', () => {
  const masked = maskRoute(northTrack(3), [{ ...home, radiusM: 500 }]);
  expect(masked).toEqual({ segments: [], hiddenPoints: 3 });
});

it('applies several zones', () => {
  // Office at 900 m, radius 60 m: masks 850, 900 and 950 m, no point on the boundary.
  const office: PrivacyZone = { lat: 45 + 900 * DEG_PER_M, lng: 5, radiusM: 60, label: null };
  const masked = maskRoute(northTrack(25), [home, office]); // 0 → 1200 m
  expect(masked.hiddenPoints).toBe(5 + 3);
  expect(masked.segments).toHaveLength(2);
});

/**
 * PR #80 review: sparse points on either side of the zone, none inside. Without cutting,
 * the straight line between them would cross the home.
 */
it('cuts a segment crossing a zone without any point falling inside', () => {
  const south = { latitude: 45 - 400 * DEG_PER_M, longitude: 5 };
  const north = { latitude: 45 + 400 * DEG_PER_M, longitude: 5 };
  const masked = maskRoute([south, north], [home]);
  expect(masked.hiddenPoints).toBe(0);
  expect(masked.segments).toEqual([[south], [north]]);
});

it('does not cut a segment passing beside the zone', () => {
  const west = { latitude: 45, longitude: 5 - 0.01 };
  const farNorth = { latitude: 45 + 400 * DEG_PER_M, longitude: 5 - 0.01 };
  expect(maskRoute([west, farNorth], [home]).segments).toEqual([[west, farNorth]]);
});


describe('offset centre (PR #80 review)', () => {
  const { jitteredCenter, CENTER_JITTER_RATIO } = jest.requireActual('../privacy');
  const { haversineM } = jest.requireActual('../../session/metrics');

  it('does not store the real position as the centre', () => {
    const c = jitteredCenter(48.8566, 2.3522, 500, () => 0.5);
    expect(haversineM(48.8566, 2.3522, c.lat, c.lng)).toBeGreaterThan(50);
  });

  it('always covers the real position with a margin of at least 70 % of the radius', () => {
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
