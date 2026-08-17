/**
 * LoadingState — chargement initial d'un écran, avant toute donnée.
 *
 * À ne PAS utiliser pour un rafraîchissement : quand des données sont déjà à l'écran,
 * les remplacer par un spinner est une régression (l'utilisateur perd sa lecture).
 * Dans ce cas, `RefreshControl` ou l'indicateur de pied de liste suffisent.
 */
import React from 'react';
import { ActivityIndicator } from 'react-native';

import { useTheme } from '../use-theme';
import { StateView } from './StateView';

interface Props {
  title?: string;
  message?: string;
  testID?: string;
}

export function LoadingState({ title = 'Chargement', message, testID = 'loading-state' }: Props) {
  const theme = useTheme();
  return (
    <StateView
      testID={testID}
      glyph={<ActivityIndicator color={theme.textSecondary} accessibilityLabel="Chargement" />}
      title={title}
      message={message}
    />
  );
}
