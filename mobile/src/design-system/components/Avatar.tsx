/**
 * Initials avatar (#7). No file, no storage: profile photos are out of scope for now
 * (#79), and they would require a file storage that doesn't exist.
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

/** "Marie Curie" → "MC"; without a name, the email's initial; otherwise "?". */
export function initialsOf(displayName: string | null | undefined, email: string | null | undefined): string {
  // By code point (`Array.from`), not by UTF-16 unit: `"😀 Alice"[0]` would return half an
  // emoji, shown as a replacement character (PR #80 review).
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
