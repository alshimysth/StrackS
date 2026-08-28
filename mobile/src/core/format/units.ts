/**
 * Formatage centralisé des grandeurs physiques (#30, #4).
 *
 * SOURCE UNIQUE de toute conversion d'unité de l'app. Avant ce module, chaque écran
 * formatait pour son compte — `formatKm` côté course, une fonction `kmh()` locale côté
 * marche — si bien qu'un même effort s'affichait différemment selon l'écran, et qu'aucune
 * préférence ne pouvait s'appliquer partout.
 *
 * RÈGLE ABSOLUE (DoD #30) : les données restent en **unités SI** partout — mètres,
 * secondes, mètres/seconde. Rien ici ne convertit une donnée stockée ; ces fonctions
 * produisent des chaînes d'affichage, en bout de chaîne, et jamais des nombres réinjectés
 * dans un calcul.
 */

export type Units = 'metric' | 'imperial';
/** Allure (temps par unité de distance) ou vitesse (distance par heure). */
export type SpeedDisplay = 'pace' | 'speed';

const M_PER_KM = 1000;
const M_PER_MILE = 1609.344;
const M_PER_FOOT = 0.3048;

/** Virgule décimale : convention des maquettes, y compris en impérial. */
function decimal(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

export function distanceUnit(units: Units): string {
  return units === 'imperial' ? 'mi' : 'km';
}

export function elevationUnit(units: Units): string {
  return units === 'imperial' ? 'ft' : 'm';
}

export function speedUnit(units: Units, display: SpeedDisplay): string {
  if (display === 'pace') {
    return units === 'imperial' ? '/mi' : '/km';
  }
  return units === 'imperial' ? 'mph' : 'km/h';
}

/** 4213 m → « 4,21 » (km) ou « 2,62 » (miles). Valeur seule, sans unité. */
export function formatDistance(meters: number, units: Units): string {
  const divisor = units === 'imperial' ? M_PER_MILE : M_PER_KM;
  return decimal(meters / divisor, 2);
}

/** Dénivelé — arrondi à l'entier : le demi-mètre n'a aucun sens sur du GPS. */
export function formatElevation(meters: number, units: Units): string {
  const value = units === 'imperial' ? meters / M_PER_FOOT : meters;
  return String(Math.round(value));
}

/** 331 s/km → « 5'31" ». Le zéro de tête des secondes est significatif. */
export function formatPaceValue(secondsPerUnit: number): string {
  if (!Number.isFinite(secondsPerUnit) || secondsPerUnit <= 0) {
    return '—';
  }
  const minutes = Math.floor(secondsPerUnit / 60);
  const seconds = Math.round(secondsPerUnit % 60);
  return `${minutes}'${String(seconds).padStart(2, '0')}"`;
}

/**
 * Vitesse → chaîne, selon la préférence d'unité ET le mode d'affichage.
 *
 * `pace` et `speed` ne sont pas deux habillages du même nombre : ce sont deux inverses.
 * Un coureur lit 5'30"/km, un marcheur 5,2 km/h — c'est un modèle mental, pas une
 * coquetterie, d'où le réglage par sport porté par `sportDisplay`.
 *
 * @param speedMs vitesse en m/s (unité SI, telle que stockée)
 */
export function formatSpeed(speedMs: number, units: Units, display: SpeedDisplay): string {
  if (!Number.isFinite(speedMs) || speedMs <= 0) {
    return '—';
  }
  if (display === 'speed') {
    const perHour = units === 'imperial' ? (speedMs * 3600) / M_PER_MILE : (speedMs * 3.6);
    return decimal(perHour, 1);
  }
  const metersPerUnit = units === 'imperial' ? M_PER_MILE : M_PER_KM;
  return formatPaceValue(metersPerUnit / speedMs);
}

/**
 * Allure moyenne d'un effort, depuis distance et durée brutes.
 *
 * Passe par la vitesse plutôt que de diviser directement : une seule formule à relire,
 * et le cas « distance nulle » se traite au même endroit.
 */
export function formatAverage(
  distanceM: number,
  durationS: number,
  units: Units,
  display: SpeedDisplay,
): string {
  if (durationS <= 0 || distanceM <= 0) {
    return '—';
  }
  return formatSpeed(distanceM / durationS, units, display);
}

/** 3724 s → « 1:02:04 » ; 754 s → « 12:34 ». Indépendant du système d'unités. */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
