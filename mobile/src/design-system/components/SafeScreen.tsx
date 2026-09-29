/**
 * Racine d'écran qui respecte les bords sûrs (#5) : encoche, Dynamic Island, barre de
 * statut, barre de gestes.
 *
 * Tous les écrans en ont besoin, et chacun le faisait (ou l'oubliait) à sa façon — d'où ce
 * composant unique. Les écrans à onglets ne protègent que le haut : la barre d'onglets
 * gère déjà le bas.
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
