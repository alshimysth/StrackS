/**
 * Avatar à initiales (#7). Aucun fichier, aucun stockage : c'est l'option minimale
 * proposée dans le ticket en attendant une décision sur l'envoi de photos, qui supposerait
 * un stockage de fichiers inexistant aujourd'hui.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../theme';
import { useTheme } from '../use-theme';

interface Props {
  displayName: string | null | undefined;
  email: string | null | undefined;
  size?: number;
}

/** « Marie Curie » → « MC » ; sans nom, l'initiale de l'email ; sinon « ? ». */
export function initialsOf(displayName: string | null | undefined, email: string | null | undefined): string {
  // Par point de code (`Array.from`), pas par unité UTF-16 : `"😀 Alice"[0]` rendrait une
  // moitié d'emoji, affichée comme un caractère de remplacement (revue PR #80).
  const chars = (word: string) => Array.from(word);
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (chars(words[0])[0] + chars(words[words.length - 1])[0]).toUpperCase();
  }
  if (words.length === 1) {
    return chars(words[0]).slice(0, 2).join('').toUpperCase();
  }
  const local = chars((email ?? '').trim());
  return local.length > 0 ? local[0].toUpperCase() : '?';
}

export function Avatar({ displayName, email, size = 64 }: Props) {
  const theme = useTheme();
  return (
    <View
      testID="avatar"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.circle,
        { width: size, height: size, backgroundColor: colors.primary500 },
      ]}
    >
      <Text style={[typography.h3, { color: theme.textOnPrimary }]}>{initialsOf(displayName, email)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
