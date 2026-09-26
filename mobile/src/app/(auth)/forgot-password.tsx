/**
 * Mot de passe oublié (#74) — deux étapes sur un seul écran : demander un code, puis le
 * saisir avec le nouveau mot de passe.
 *
 * Un code plutôt qu'un lien : il se recopie depuis n'importe quel appareil, là où un lien
 * profond échoue dès que l'email est ouvert sur un ordinateur.
 *
 * L'écran ne dit jamais si l'adresse a un compte — le serveur non plus (202 dans tous les
 * cas). Le message de la seconde étape est donc conditionnel : « si un compte existe ».
 */
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  accountErrorMessage,
  resetConfirmSchema,
  resetRequestSchema,
  useConfirmPasswordReset,
  useRequestPasswordReset,
} from '../../core/api/use-account';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

type Step = 'request' | 'confirm' | 'done';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const requestReset = useRequestPasswordReset();
  const confirmReset = useConfirmPasswordReset();

  const [step, setStep] = React.useState<Step>('request');
  const [email, setEmail] = React.useState(params.email ?? '');
  const [code, setCode] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({});

  const sendCode = () => {
    const parsed = resetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors({ email: parsed.error.flatten().fieldErrors.email?.[0] });
      return;
    }
    setErrors({});
    confirmReset.reset(); // l'erreur affichée doit être celle de la dernière action
    requestReset.mutate(parsed.data, { onSuccess: () => setStep('confirm') });
  };

  const submitNewPassword = () => {
    const parsed = resetConfirmSchema.safeParse({ code, newPassword: password, confirmation });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({
        code: flat.code?.[0],
        newPassword: flat.newPassword?.[0],
        confirmation: flat.confirmation?.[0],
      });
      return;
    }
    setErrors({});
    confirmReset.mutate(
      { email: email.trim(), code: parsed.data.code, newPassword: parsed.data.newPassword },
      { onSuccess: () => setStep('done') },
    );
  };

  // À l'étape du code, « Renvoyer un code » relance la demande : son refus (un 429, le
  // plus souvent, avec son délai) doit s'afficher aussi (revue CodeRabbit, PR #78).
  const apiError = accountErrorMessage(
    step === 'request' ? requestReset.error : (confirmReset.error ?? requestReset.error),
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.surfaceApp }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[typography.h2, { color: theme.textPrimary }]}>Mot de passe oublié</Text>

        {step === 'request' && (
          <View style={styles.form}>
            <Text style={[typography.bodyLg, { color: theme.textSecondary }]}>
              Saisis l’adresse de ton compte : tu recevras un code pour choisir un nouveau mot
              de passe.
            </Text>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              testID="reset-email"
            />
            {apiError != null && (
              <Text style={[typography.body, { color: theme.textError }]}>{apiError}</Text>
            )}
            <Button size="lg" fullWidth onPress={sendCode} disabled={requestReset.isPending}>
              {requestReset.isPending ? 'Envoi…' : 'Recevoir un code'}
            </Button>
          </View>
        )}

        {step === 'confirm' && (
          <View style={styles.form}>
            <Text testID="reset-code-sent" style={[typography.bodyLg, { color: theme.textSecondary }]}>
              Si un compte existe pour {email.trim()}, un code vient d’y être envoyé. Il est
              valable 15 minutes.
            </Text>
            <Input
              label="Code reçu"
              value={code}
              onChangeText={setCode}
              error={errors.code}
              autoCapitalize="characters"
              autoComplete="one-time-code"
              testID="reset-code"
            />
            <Input
              label="Nouveau mot de passe"
              value={password}
              onChangeText={setPassword}
              error={errors.newPassword}
              secureTextEntry
              autoComplete="new-password"
              testID="reset-password"
            />
            <Input
              label="Confirme le nouveau mot de passe"
              value={confirmation}
              onChangeText={setConfirmation}
              error={errors.confirmation}
              secureTextEntry
              autoComplete="new-password"
              testID="reset-confirmation"
            />
            {apiError != null && (
              <Text style={[typography.body, { color: theme.textError }]}>{apiError}</Text>
            )}
            <Button size="lg" fullWidth onPress={submitNewPassword} disabled={confirmReset.isPending}>
              {confirmReset.isPending ? 'Enregistrement…' : 'Changer le mot de passe'}
            </Button>
            <Button variant="text" fullWidth onPress={sendCode} disabled={requestReset.isPending}>
              Renvoyer un code
            </Button>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.form}>
            <Text testID="reset-done" style={[typography.bodyLg, { color: theme.textPrimary }]}>
              Mot de passe changé. Toutes tes sessions ont été fermées : connecte-toi avec le
              nouveau.
            </Text>
            <Button size="lg" fullWidth onPress={() => router.replace('/(auth)/login')}>
              Se connecter
            </Button>
          </View>
        )}

        {step !== 'done' && (
          <Button variant="text" fullWidth onPress={() => router.back()}>
            Retour à la connexion
          </Button>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.layoutGutter, gap: spacing.base },
  form: { gap: spacing.base, marginTop: spacing.lg },
});
