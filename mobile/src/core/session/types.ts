/**
 * Session engine contracts (Epic 3). Defined in core/: sport modules consume them through
 * sports/types.ts, never the other way around.
 */

export interface LiveMetric {
  label: string;
  value: string;
  unit?: string;
}

/** Session state published by core/session, derived from the accepted GPS points. */
export interface SessionState {
  elapsedS: number;
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  /** Smoothed speed in m/s over the recent window. */
  smoothedSpeedMs: number;
}

export const ZERO_SESSION_STATE: SessionState = {
  elapsedS: 0,
  distanceM: 0,
  elevationGainM: 0,
  elevationLossM: 0,
  smoothedSpeedMs: 0,
};
