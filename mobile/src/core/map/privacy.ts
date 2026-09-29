/**
 * Zones de confidentialité (#37) — masquage **à l'affichage**.
 *
 * Choix : on masque, on ne tronque pas. Le tracé complet reste stocké côté serveur et
 * figure dans l'export (#76) ; seul ce qui est dessiné change. Une troncature à l'envoi
 * serait irréversible — une zone mal placée détruirait des données que l'utilisateur ne
 * pourrait jamais retrouver — et fausserait la distance recalculée par le serveur.
 *
 * Deux règles pour que le masque ne trahisse pas ce qu'il cache :
 *  - le tracé est **coupé** aux points masqués, et aussi entre deux points visibles dont
 *    le segment traverse une zone — une corde tracée à travers le cercle désignerait son
 *    centre ;
 *  - la carte se cadre sur les seuls points visibles — un cadrage calculé sur tout le
 *    tracé centrerait la vue sur le domicile.
 */
import { haversineM } from '../session/metrics';
import type { PrivacyZone } from '../preferences/schema';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MaskedRoute {
  /** Portions visibles, dans l'ordre : chacune se dessine comme une ligne distincte. */
  segments: MapPoint[][];
  /** Nombre de points retirés : l'écran le dit, plutôt que de laisser croire à un trou GPS. */
  hiddenPoints: number;
}

function isHidden(point: MapPoint, zones: readonly PrivacyZone[]): boolean {
  return zones.some(
    (zone) => haversineM(point.latitude, point.longitude, zone.lat, zone.lng) <= zone.radiusM,
  );
}

/**
 * Le segment [a, b] passe-t-il dans la zone, même si ses deux extrémités sont dehors ?
 *
 * Revue PR #80 : avec des points espacés (mode économie, trou de signal), deux points
 * visibles de part et d'autre d'une zone seraient reliés par une ligne droite qui la
 * traverse — exactement ce que le masque doit empêcher.
 *
 * Projection plane locale centrée sur la zone (équirectangulaire) : à l'échelle de
 * quelques kilomètres, l'erreur est négligeable devant le rayon.
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
  // Point du segment le plus proche du centre de la zone.
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
        segments.push(current); // on coupe : la ligne ne traverse jamais une zone
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

/** Part du rayon dont le centre stocké peut s'écarter de la position réelle. */
export const CENTER_JITTER_RATIO = 0.3;

/**
 * Centre d'une nouvelle zone, **décalé au hasard** de la position réelle (revue PR #80).
 *
 * Un cercle centré sur le domicile le trahit : un tracé qui l'aborde par plusieurs côtés
 * dessine ses bords, donc son centre. Décalé d'au plus 30 % du rayon dans une direction
 * aléatoire, le centre ne désigne plus rien, et la position réelle reste couverte avec au
 * moins 70 % du rayon de marge. Le décalage est tiré une fois, à la création : le cercle
 * reste stable d'une séance à l'autre, sinon la superposition des tracés le révélerait.
 *
 * Seul ce centre décalé est stocké — la position réelle ne quitte jamais le téléphone.
 */
export function jitteredCenter(
  lat: number,
  lng: number,
  radiusM: number,
  random: () => number = Math.random,
): { lat: number; lng: number } {
  const distanceM = Math.sqrt(random()) * CENTER_JITTER_RATIO * radiusM; // uniforme sur le disque
  const bearing = random() * 2 * Math.PI;
  const dLat = (distanceM * Math.cos(bearing)) / 111_320;
  const dLng = (distanceM * Math.sin(bearing)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}
