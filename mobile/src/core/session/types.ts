/**
 * Contrats du moteur de séance (Epic 3). Définis dans core/ : les modules de
 * sport les consomment via sports/types.ts, jamais l'inverse.
 */

export interface LiveMetric {
  label: string;
  value: string;
  unit?: string;
}

/** État de séance publié par core/session — dérivé des points GPS acceptés. */
export interface SessionState {
  elapsedS: number;
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  /** Vitesse lissée en m/s sur la fenêtre récente. */
  smoothedSpeedMs: number;
}

export const ZERO_SESSION_STATE: SessionState = {
  elapsedS: 0,
  distanceM: 0,
  elevationGainM: 0,
  elevationLossM: 0,
  smoothedSpeedMs: 0,
};
