/**
 * The ONLY file in the project listing the sports (PRD constraint no. 1).
 * Adding a sport = creating src/sports/<code>/ + one import line here.
 */
import { runningModule } from './running';
import { walkingModule } from './walking';

import type { SportModule } from './types';

export const sportRegistry: Record<string, SportModule> = Object.fromEntries(
  [runningModule, walkingModule].map((m) => [m.code, m]),
);
