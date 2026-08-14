/**
 * Socle commun aux états système (vide, erreur, chargement).
 *
 * Les trois composants partagent exactement la même boîte : c'est ce qui fait qu'un
 * écran ne « saute » pas quand il passe du chargement au vide ou à l'erreur. Garder
 * cette mise en page ici plutôt que de la dupliquer trois fois est la seule façon de
 * garantir que ça reste vrai après une retouche.
 */
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../use-theme';
import { spacing, typography } from '../theme';

export interface StateViewProps {
  /** Une phrase, sans point final : c'est un titre, pas une phrase de corps. */
  title: string;
  /** Ce que l'utilisateur peut faire, ou pourquoi c'est arrivé. Optionnel. */
  message?: string;
  /** Bouton d'action (réessayer, démarrer une séance…). */
  action?: ReactNode;
  /** Pictogramme ou indicateur affiché au-dessus du titre. */
  glyph?: ReactNode;
  testID?: string;
}

export function StateView({ title, message, action, glyph, testID }: StateViewProps) {
  const theme = useTheme();
  return (
    <View style={styles.container} testID={testID}>
      {glyph}
      <Text style={[typography.h3, styles.title, { color: theme.textPrimary }]}>{title}</Text>
      {message != null && (
        <Text style={[typography.body, styles.message, { color: theme.textSecondary }]}>
          {message}
        </Text>
      )}
      {action != null && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', maxWidth: 320 },
  action: { marginTop: spacing.lg },
});
