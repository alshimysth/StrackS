/**
 * EmptyState — aucune donnée à afficher.
 *
 * Deux cas que le design distingue explicitement et qu'il ne faut pas confondre :
 *
 * - `initial` — l'utilisateur n'a rien créé. C'est une invitation à démarrer.
 * - `filtered` — il a des données, mais son filtre ne les atteint pas. Lui proposer
 *   « démarre ta première séance » ici serait faux et vaguement insultant : il en a
 *   déjà. La sortie utile est d'effacer le filtre.
 */
import React, { type ReactNode } from 'react';

import { StateView } from './StateView';

interface Props {
  variant?: 'initial' | 'filtered';
  title: string;
  message?: string;
  action?: ReactNode;
  testID?: string;
}

export function EmptyState({ variant = 'initial', title, message, action, testID }: Props) {
  return (
    <StateView
      testID={testID ?? `empty-state-${variant}`}
      title={title}
      message={message}
      action={action}
    />
  );
}
