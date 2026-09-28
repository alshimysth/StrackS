/**
 * Zones de confidentialité (#37) — masquage **à l'affichage**.
 *
 * Choix : on masque, on ne tronque pas. Le tracé complet reste stocké côté serveur et
 * figure dans l'export (#76) ; seul ce qui est dessiné change. Une troncature à l'envoi
 * serait irréversible — une zone mal placée détruirait des données que l'utilisateur ne
 * pourrait jamais retrouver — et fausserait la distance recalculée par le serveur.
 *
 * Deux règles pour que le masque ne trahisse pas ce qu'il cache :
 *  - le tracé est **coupé** aux points masqués, jamais relié par-dessus la zone — une
 *    corde tracée à travers le cercle désignerait son centre ;
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
      current.push(point);
    }
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return { segments, hiddenPoints };
}
