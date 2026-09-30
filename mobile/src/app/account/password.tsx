/**
 * Password change (#73). The other devices are logged out; this one gets a fresh
 * session, captured by the HTTP client.
 */
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { accountErrorMessage, changePasswordSchema, useChangePassword } from '../../core/api/use-account';
import { Button } from '../../design-system/components/Button';
import { FormScreen } from '../../design-system/components/FormScreen';
import { Input } from '../../design-system/components/Input';
import { typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export default function ChangePasswordScreen() {
  const theme = useTheme();
  const change = useChangePassword();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({});

  const submit = () => {
    const parsed = changePasswordSchema.safeParse({
      currentPassword: current,
      newPassword: next,
      confirmation,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({
        currentPassword: flat.currentPassword?.[0],
        newPassword: flat.newPassword?.[0],
        confirmation: flat.confirmation?.[0],
      });
      return;
    }
    setErrors({});
    change.mutate({ currentPassword: current, newPassword: next });
  };

  if (change.isSuccess) {
    return (
      <FormScreen title="Mot de passe changé" onBack={() => router.back()} backLabel="Retour au profil">
        <Text testID="password-changed" style={[typography.bodyLg, { color: theme.textPrimary }]}>
          C’est fait. Tes autres appareils ont été déconnectés ; celui-ci reste connecté.
        </Text>
      </FormScreen>
    );
  }

  const apiError = accountErrorMessage(change.error);
  return (
    <FormScreen
      title="Changer le mot de passe"
      intro="Tes autres appareils seront déconnectés."
      onBack={() => router.back()}
    >
      <Input
        label="Mot de passe actuel"
        value={current}
        onChangeText={setCurrent}
        error={errors.currentPassword}
        secureTextEntry
        autoComplete="current-password"
        testID="password-current"
      />
      <Input
        label="Nouveau mot de passe"
        value={next}
        onChangeText={setNext}
        error={errors.newPassword}
        helper="Au moins 8 caractères."
        secureTextEntry
        autoComplete="new-password"
        testID="password-new"
      />
      <Input
        label="Confirme le nouveau mot de passe"
        value={confirmation}
        onChangeText={setConfirmation}
        error={errors.confirmation}
        secureTextEntry
        autoComplete="new-password"
        testID="password-confirmation"
      />
      {apiError != null && (
        <Text testID="password-error" style={[typography.body, { color: theme.textError }]}>
          {apiError}
        </Text>
      )}
      <Button size="lg" fullWidth onPress={submit} disabled={change.isPending}>
        {change.isPending ? 'Enregistrement…' : 'Changer le mot de passe'}
      </Button>
    </FormScreen>
  );
}
