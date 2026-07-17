/**
 * Input — transposition RN de components/forms/Input.jsx (Claude Design).
 * Focus = bordure bleue ; erreur = bordure rouge + texte d'aide dessous.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../use-theme';
import { colors, fonts, radius, spacing, typography } from '../theme';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  helper?: string;
}

export function Input({ label, error, helper, ...inputProps }: Props) {
  const theme = useTheme();
  const [focused, setFocused] = React.useState(false);

  const borderColor = error
    ? colors.error500
    : focused
      ? colors.primary500
      : theme.borderSubtle;

  return (
    <View style={styles.container}>
      <Text style={[typography.label, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        {...inputProps}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        placeholderTextColor={theme.textTertiary}
        style={[
          styles.input,
          {
            borderColor,
            backgroundColor: theme.surfaceCard,
            color: theme.textPrimary,
          },
        ]}
      />
      {(error ?? helper) != null && (
        <Text
          style={[
            typography.caption,
            { color: error ? theme.textError : theme.textTertiary },
          ]}
        >
          {error ?? helper}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  input: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    height: 48,
    fontFamily: fonts.body,
    fontSize: 16,
  },
});
