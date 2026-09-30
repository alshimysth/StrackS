/**
 * Common base of the system states (empty, error, loading).
 *
 * The three components share exactly the same box: that's what keeps a screen from
 * "jumping" when it goes from loading to empty or error. Keeping this layout here rather
 * than duplicating it three times is the only way to guarantee it stays true after an
 * edit.
 */
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../use-theme';
import { spacing, typography } from '../theme';

export interface StateViewProps {
  /** One sentence, without a final full stop: it's a title, not body text. */
  title: string;
  /** What the user can do, or why it happened. Optional. */
  message?: string;
  /** Action button (retry, start a session…). */
  action?: ReactNode;
  /** Pictogram or indicator shown above the title. */
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
