/**
 * LoadingState: a screen's initial load, before any data.
 *
 * NOT to be used for a refresh: when data is already on screen, replacing it with a
 * spinner is a regression (the user loses their reading). In that case, `RefreshControl`
 * or the list footer indicator is enough.
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
