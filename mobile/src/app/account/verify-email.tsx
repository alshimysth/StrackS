/**
 * Vérification de l'adresse du compte (#75). Un code est envoyé à l'inscription ; cet
 * écran permet de le saisir, ou d'en redemander un s'il a expiré (24 h).
 */
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import {
  accountErrorMessage,
  codeSchema,
  useConfirmEmailVerification,
  useRequestEmailVerification,
} from '../../core/api/use-account';
import { useAuthStore } from '../../core/auth/use-auth-store';
import { Button } from '../../design-system/components/Button';
import { FormScreen } from '../../design-system/components/FormScreen';
import { Input } from '../../design-system/components/Input';
import { typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export default function VerifyEmailScreen() {
  const theme = useTheme();
  const email = useAuthStore((s) => s.user?.email);
  const resend = useRequestEmailVerification();
  const confirm = useConfirmEmailVerification();
  const [code, setCode] = React.useState('');
  const [codeError, setCodeError] = React.useState<string | undefined>();

  const submit = () => {
    const parsed = codeSchema.safeParse({ code });
    if (!parsed.success) {
      setCodeError(parsed.error.flatten().fieldErrors.code?.[0]);
      return;
    }
    setCodeError(undefined);
    confirm.mutate(parsed.data);
  };

  if (confirm.isSuccess) {
    return (
      <FormScreen title="Adresse vérifiée" onBack={() => router.back()} backLabel="Retour au profil">
        <Text testID="email-verified" style={[typography.bodyLg, { color: theme.textPrimary }]}>
          Merci : ton adresse est confirmée.
        </Text>
      </FormScreen>
    );
  }

  const apiError = accountErrorMessage(confirm.error ?? resend.error);
  return (
    <FormScreen
      title="Vérifier mon adresse"
      intro={`Saisis le code reçu sur ${email ?? 'ton adresse'} à l’inscription.`}
      onBack={() => router.back()}
    >
      <Input
        label="Code reçu"
        value={code}
        onChangeText={setCode}
        error={codeError}
        autoCapitalize="characters"
        autoComplete="one-time-code"
        testID="verify-code"
      />
      {resend.isSuccess && (
        <Text testID="verify-resent" style={[typography.body, { color: theme.textSecondary }]}>
          Nouveau code envoyé. Le précédent ne fonctionne plus.
        </Text>
      )}
      {apiError != null && (
        <Text testID="verify-error" style={[typography.body, { color: theme.textError }]}>
          {apiError}
        </Text>
      )}
      <Button size="lg" fullWidth onPress={submit} disabled={confirm.isPending}>
        {confirm.isPending ? 'Vérification…' : 'Vérifier'}
      </Button>
      <Button variant="text" fullWidth onPress={() => resend.mutate()} disabled={resend.isPending}>
        Renvoyer un code
      </Button>
    </FormScreen>
  );
}
