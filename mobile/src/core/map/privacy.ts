/**
 * Privacy zones (#37): masking **at display time**.
 *
 * Choice: we mask, we don't truncate. The full track stays stored on the server and is in
 * the export (#76); only what's drawn changes. Truncating at upload would be
 * irreversible (a misplaced zone would destroy data the user could never recover) and
 * would distort the distance recomputed by the server.
 *
 * Two rules so the mask doesn't give away what it hides:
 *  - the track is **cut** at masked points, and also between two visible points whose
 *    segment crosses a zone: a chord drawn across the circle would point to its centre;
 *  - the map frames only the visible points: framing computed on the whole track would
 *    centre the view on the home.
 */
import { haversineM } from '../session/metrics';
import type { PrivacyZone } from '../preferences/schema';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MaskedRoute {
  /** Visible portions, in order: each one is drawn as a separate line. */
  segments: MapPoint[][];
  /** Number of removed points: the screen says so, rather than suggesting a GPS gap. */
  hiddenPoints: number;
}

function isHidden(point: MapPoint, zones: readonly PrivacyZone[]): boolean {
  return zones.some(
    (zone) => haversineM(point.latitude, point.longitude, zone.lat, zone.lng) <= zone.radiusM,
  );
}

/**
 * Does segment [a, b] go through the zone, even if both ends are outside?
 *
 * PR #80 review: with sparse points (saver mode, signal gap), two visible points on either
 * side of a zone would be joined by a straight line crossing it, exactly what the mask
 * must prevent.
 *
 * Local planar projection centred on the zone (equirectangular): at the scale of a few
 * kilometres, the error is negligible compared to the radius.
 */
function crossesZone(a: MapPoint, b: MapPoint, zone: PrivacyZone): boolean {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((zone.lat * Math.PI) / 180);
  const ax = (a.longitude - zone.lng) * mPerDegLng;
  const ay = (a.latitude - zone.lat) * mPerDegLat;
  const bx = (b.longitude - zone.lng) * mPerDegLng;
  const by = (b.latitude - zone.lat) * mPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  // Point of the segment closest to the zone's centre.
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return cx * cx + cy * cy <= zone.radiusM * zone.radiusM;
}

export function maskRoute(path: readonly MapPoint[], zones: readonly PrivacyZone[]): MaskedRoute {
  if (zones.length === 0) {
    return { segments: path.length > 0 ? [[...path]] : [], hiddenPoints: 0 };
  }
  const segments: MapPoint[][] = [];
  let current: MapPoint[] = [];
  let hiddenPoints = 0;
  for (const point of path) {
    if (isHidden(point, zones)) {
      hiddenPoints += 1;
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    } else {
      const previous = current[current.length - 1];
      if (previous != null && zones.some((zone) => crossesZone(previous, point, zone))) {
        segments.push(current); // cut: the line never crosses a zone
        current = [];
      }
      current.push(point);
    }
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return { segments, hiddenPoints };
}

/** Fraction of the radius by which the stored centre may deviate from the real position. */
export const CENTER_JITTER_RATIO = 0.3;

/**
 * Centre of a new zone, **randomly offset** from the real position (PR #80 review).
 *
 * A circle centred on the home gives it away: a track approaching it from several sides
 * draws its edges, hence its centre. Offset by at most 30 % of the radius in a random
 * direction, the centre no longer points to anything, and the real position stays covered
 * with at least 70 % of the radius as margin. The offset is drawn once, at creation: the
 * circle stays stable from one session to the next, otherwise overlaying tracks would
 * reveal it.
 *
 * Only this offset centre is stored: the real position never leaves the phone.
 */
export function jitteredCenter(
  lat: number,
  lng: number,
  radiusM: number,
  random: () => number = Math.random,
): { lat: number; lng: number } {
  const distanceM = Math.sqrt(random()) * CENTER_JITTER_RATIO * radiusM; // uniform over the disc
  const bearing = random() * 2 * Math.PI;
  const dLat = (distanceM * Math.cos(bearing)) / 111_320;
  const dLng = (distanceM * Math.sin(bearing)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}
