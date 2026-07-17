/**
 * Connexion — UI 100 % design system (Volt Performance), français, ton coach.
 * NOTE design : l'écran auth n'est pas encore spécifié dans le projet Claude
 * Design (manque connu, PLAN §1.3) — composition minimale avec les composants
 * existants, à revalider quand la spec écran existera.
 */
import { Link, router } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../core/api/client';
import { loginSchema, useLogin } from '../../core/api/use-auth';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export default function LoginScreen() {
  const theme = useTheme();
  const login = useLogin();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string }>({});

  const submit = () => {
    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: flat.email?.[0], password: flat.password?.[0] });
      return;
    }
    setFieldErrors({});
    login.mutate(parsed.data, { onSuccess: () => router.replace('/(tabs)') });
  };

  const apiError =
    login.error instanceof ApiError
      ? login.error.status === 401
        ? 'Email ou mot de passe incorrect.'
        : login.error.message
      : login.error
        ? 'Serveur injoignable. Réessaie.'
        : null;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.surfaceApp }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[typography.h1, { color: theme.textPrimary }]}>StrackS</Text>
        <Text style={[typography.bodyLg, { color: theme.textSecondary, marginTop: spacing.xs }]}>
          Connecte-toi pour retrouver tes séances.
        </Text>

        <View style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            testID="login-email"
          />
          <Input
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
            secureTextEntry
            autoComplete="password"
            testID="login-password"
          />
          {apiError != null && (
            <Text style={[typography.body, { color: theme.textError }]}>{apiError}</Text>
          )}
          <Button size="lg" fullWidth onPress={submit} disabled={login.isPending}>
            {login.isPending ? 'Connexion…' : 'Se connecter'}
          </Button>
        </View>

        <View style={styles.footer}>
          <Text style={[typography.body, { color: theme.textSecondary }]}>
            Pas encore de compte ?
          </Text>
          <Link href="/(auth)/register" style={[typography.bodyLg, { color: '#3d78e6' }]}>
            Créer un compte
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
