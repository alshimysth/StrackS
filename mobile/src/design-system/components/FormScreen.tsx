/**
 * Template of the form screens outside the tabs (account, #73/#75): title, intro text,
 * content, back; scrolling above the keyboard, safe edges respected.
 */
import React, { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from './Button';
import { spacing, typography } from '../theme';
import { useTheme } from '../use-theme';

interface Props {
  title: string;
  intro?: string;
  onBack: () => void;
  backLabel?: string;
  children: ReactNode;
}

export function FormScreen({ title, intro, onBack, backLabel = 'Retour', children }: Props) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.surfaceApp }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={[typography.h2, { color: theme.textPrimary }]}>{title}</Text>
          {intro != null && (
            <Text style={[typography.bodyLg, { color: theme.textSecondary }]}>{intro}</Text>
          )}
          {children}
          <Button variant="text" fullWidth onPress={onBack}>
            {backLabel}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.layoutGutter, gap: spacing.base },
});
