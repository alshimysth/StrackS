/**
 * Screen root respecting the safe edges (#5): notch, Dynamic Island, status bar, gesture
 * bar.
 *
 * Every screen needs it, and each did it (or forgot it) its own way, hence this single
 * component. Tab screens only protect the top: the tab bar already handles the bottom.
 */
import React, { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '../use-theme';

interface Props {
  children: ReactNode;
  edges?: Edge[];
  testID?: string;
}

export function SafeScreen({ children, edges = ['top'], testID = 'safe-screen' }: Props) {
  const theme = useTheme();
  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={[styles.fill, { backgroundColor: theme.surfaceApp }]}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
