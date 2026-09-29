/**
 * Centralized formatting of physical quantities (#30, #4).
 *
 * The SINGLE SOURCE of every unit conversion in the app. Before this module, each screen
 * formatted on its own (`formatKm` for running, a local `kmh()` function for walking), so
 * the same effort was displayed differently depending on the screen, and no preference
 * could apply everywhere.
 *
 * ABSOLUTE RULE (DoD #30): data stays in **SI units** everywhere: metres, seconds, metres
 * per second. Nothing here converts stored data; these functions produce display strings,
 * at the very end of the chain, never numbers fed back into a computation.
 */

export type Units = 'metric' | 'imperial';
/** Pace (time per unit of distance) or speed (distance per hour). */
export type SpeedDisplay = 'pace' | 'speed';

const M_PER_KM = 1000;
const M_PER_MILE = 1609.344;
const M_PER_FOOT = 0.3048;

/** Decimal comma: the mockups' convention, imperial included. */
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

/** 4213 m → "4,21" (km) or "2,62" (miles). Value only, without unit. */
export function formatDistance(meters: number, units: Units): string {
  const divisor = units === 'imperial' ? M_PER_MILE : M_PER_KM;
  return decimal(meters / divisor, 2);
}

/** Elevation, rounded to the integer: half a metre is meaningless with GPS. */
export function formatElevation(meters: number, units: Units): string {
  const value = units === 'imperial' ? meters / M_PER_FOOT : meters;
  return String(Math.round(value));
}

/** 331 s/km → "5'31"". The leading zero of the seconds matters. */
export function formatPaceValue(secondsPerUnit: number): string {
  if (!Number.isFinite(secondsPerUnit) || secondsPerUnit <= 0) {
    return '—';
  }
  // Round BEFORE splitting, never after: rounding the remainder produces "4'60"" for
  // 299.6 s, since 299.6 % 60 = 59.6 rounds to 60.
  const total = Math.round(secondsPerUnit);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}'${String(seconds).padStart(2, '0')}"`;
}

/**
 * Speed → string, according to the unit preference AND the display mode.
 *
 * `pace` and `speed` aren't two dressings of the same number: they're inverses. A runner
 * reads 5'30"/km, a walker 5.2 km/h; it's a mental model, not a whim, hence the per-sport
 * setting carried by `sportDisplay`.
 *
 * @param speedMs speed in m/s (SI unit, as stored)
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
 * Average pace of an effort, from raw distance and duration.
 *
 * Goes through the speed rather than dividing directly: a single formula to review, and
 * the "zero distance" case is handled in one place.
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

/** 3724 s → "1:02:04"; 754 s → "12:34". Independent from the unit system. */
export function formatDuration(totalSeconds: number): string {
  // Same trap as for pace: 59.6 s gave "0:60", and 3599.6 s "59:60".
  const total = Math.round(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Long total (#7, profile): "45 h 12 min" rather than "45:12:08". At the scale of a
 * sporting life, seconds add nothing and the clock format reads poorly.
 */
export function formatLongDuration(totalSeconds: number): string {
  const minutes = Math.round(Math.max(0, totalSeconds) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

// --- Weight (#32) -------------------------------------------------------------------
// Stored in kilograms (SI) on the server. The imperial system enters and reads pounds;
// the conversion only exists at the edges of the screen, never in data sent.

const KG_PER_LB = 0.45359237;

export function weightUnit(units: Units): string {
  return units === 'imperial' ? 'lb' : 'kg';
}

/** kg → displayed value, rounded to one decimal. */
export function toDisplayWeight(kg: number, units: Units): number {
  const value = units === 'imperial' ? kg / KG_PER_LB : kg;
  return Math.round(value * 10) / 10;
}

/** Entered value → kg, rounded to one decimal (a scale's precision, no more). */
export function fromDisplayWeight(value: number, units: Units): number {
  const kg = units === 'imperial' ? value * KG_PER_LB : value;
  return Math.round(kg * 10) / 10;
}
