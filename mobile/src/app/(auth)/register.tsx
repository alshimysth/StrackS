/** Inscription — mêmes conventions que login.tsx. */
import { Link, router } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../core/api/client';
import { registerSchema, useRegister } from '../../core/api/use-auth';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export default function RegisterScreen() {
  const theme = useTheme();
  const register = useRegister();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string }>({});

  const submit = () => {
    const parsed = registerSchema.safeParse({
      email: email.trim(),
      password,
      displayName: displayName.trim() || undefined,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: flat.email?.[0], password: flat.password?.[0] });
      return;
    }
    setFieldErrors({});
    register.mutate(parsed.data, { onSuccess: () => router.replace('/(tabs)') });
  };

  const apiError =
    register.error instanceof ApiError
      ? register.error.status === 409
        ? 'Un compte existe déjà avec cet email.'
        : register.error.message
      : register.error
        ? 'Serveur injoignable. Réessaie.'
        : null;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.surfaceApp }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[typography.h1, { color: theme.textPrimary }]}>Crée ton compte</Text>
        <Text style={[typography.bodyLg, { color: theme.textSecondary, marginTop: spacing.xs }]}>
          Toutes tes séances, un seul endroit.
        </Text>

        <View style={styles.form}>
          <Input
            label="Nom affiché"
            value={displayName}
            onChangeText={setDisplayName}
            helper="Optionnel"
            testID="register-display-name"
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            testID="register-email"
          />
          <Input
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
            helper="Au moins 8 caractères"
            secureTextEntry
            autoComplete="new-password"
            testID="register-password"
          />
          {apiError != null && (
            <Text style={[typography.body, { color: theme.textError }]}>{apiError}</Text>
          )}
          <Button size="lg" fullWidth onPress={submit} disabled={register.isPending}>
            {register.isPending ? 'Création…' : 'Créer mon compte'}
          </Button>
        </View>

        <View style={styles.footer}>
          <Text style={[typography.body, { color: theme.textSecondary }]}>Déjà inscrit ?</Text>
          <Link href="/(auth)/login" style={[typography.bodyLg, { color: '#3d78e6' }]}>
            Se connecter
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.layoutGutter,
  },
  form: { gap: spacing.base, marginTop: spacing.xl },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    alignItems: 'baseline',
  },
});
