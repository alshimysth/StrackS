/**
 * Display order of sports on the home screen (#34).
 *
 * The PRD requires starting a session in **≤ 2 interactions**. Without a preference, a
 * user who only runs first has to find their sport in a list ordered by the server, then
 * pick it, then start: three gestures.
 *
 * A pure function isolated from rendering: it's #34's business rule, testable without
 * mounting a screen. The core still knows no sport: the sport code is only an opaque key
 * here, no `switch` is possible.
 */

export interface OrderedSport {
  code: string;
}

/**
 * Moves the preferred sport to the top, keeping the server order for the rest.
 *
 * Tolerant by design (DoD #34): a `defaultSport` no longer in the registry (sport removed
 * from the backend, or renamed) simply leaves the list unchanged rather than emptying it
 * or throwing.
 */
export function orderSports<T extends OrderedSport>(sports: T[], defaultSport: string | null): T[] {
  if (defaultSport == null) {
    return sports;
  }
  const preferred = sports.find((s) => s.code === defaultSport);
  if (preferred == null) {
    return sports;
  }
  return [preferred, ...sports.filter((s) => s.code !== defaultSport)];
}

/**
 * Sport preselected when the home screen opens.
 *
 * That's the half that really saves an interaction: showing the sport first isn't enough,
 * it also has to be already selected so that "Démarrer" is the next gesture.
 */
export function initialSelection<T extends OrderedSport>(
  sports: T[],
  defaultSport: string | null,
): string | null {
  if (sports.length === 0) {
    return null;
  }
  if (defaultSport != null && sports.some((s) => s.code === defaultSport)) {
    return defaultSport;
  }
  return null;
}
