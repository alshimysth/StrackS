/**
 * SEUL fichier du projet qui liste les sports (contrainte PRD n°1).
 * Ajouter un sport = créer src/sports/<code>/ + une ligne d'import ici.
 */
import { runningModule } from './running';
import { walkingModule } from './walking';

import type { SportModule } from './types';

export const sportRegistry: Record<string, SportModule> = Object.fromEntries(
  [runningModule, walkingModule].map((m) => [m.code, m]),
);
