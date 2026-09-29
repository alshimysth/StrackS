/**
 * Email address change (#75). The code goes to the NEW address: until it's entered, the
 * account keeps the old one, which is still used to log in.
 */
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import {
  accountErrorMessage,
  codeSchema,
  emailChangeSchema,
  useConfirmEmailChange,
  useRequestEmailChange,
} from '../../core/api/use-account';
import { Button } from '../../design-system/components/Button';
import { FormScreen } from '../../design-system/components/FormScreen';
import { Input } from '../../design-system/components/Input';
import { typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export default function ChangeEmailScreen() {
  const theme = useTheme();
  const request = useRequestEmailChange();
  const confirm = useConfirmEmailChange();
  const [newEmail, setNewEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({});

  const sendCode = () => {
    const parsed = emailChangeSchema.safeParse({ newEmail, currentPassword: password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({ newEmail: flat.newEmail?.[0], currentPassword: flat.currentPassword?.[0] });
      return;
    }
    setErrors({});
    request.mutate(parsed.data);
  };

  const submitCode = () => {
    const parsed = codeSchema.safeParse({ code });
    if (!parsed.success) {
      setErrors({ code: parsed.error.flatten().fieldErrors.code?.[0] });
      return;
    }
    setErrors({});
    confirm.mutate(parsed.data);
  };

  if (confirm.isSuccess) {
    return (
      <FormScreen title="Adresse changée" onBack={() => router.back()} backLabel="Retour au profil">
        <Text testID="email-changed" style={[typography.bodyLg, { color: theme.textPrimary }]}>
          Ton compte utilise désormais {confirm.data.email}. L’ancienne adresse a été prévenue.
        </Text>
      </FormScreen>
    );
  }

  if (request.isSuccess) {
    const apiError = accountErrorMessage(confirm.error);
    return (
      <FormScreen
        title="Confirme la nouvelle adresse"
        intro={`Un code vient d’être envoyé à ${newEmail.trim()}. Il est valable 30 minutes.`}
        onBack={() => request.reset()}
        backLabel="Changer d’adresse"
      >
        <Input
          label="Code reçu"
          value={code}
          onChangeText={setCode}
          error={errors.code}
          autoCapitalize="characters"
          autoComplete="one-time-code"
          testID="email-code"
        />
        {apiError != null && (
          <Text testID="email-error" style={[typography.body, { color: theme.textError }]}>
            {apiError}
          </Text>
        )}
        <Button size="lg" fullWidth onPress={submitCode} disabled={confirm.isPending}>
          {confirm.isPending ? 'Vérification…' : 'Confirmer'}
        </Button>
      </FormScreen>
    );
  }

  const apiError = accountErrorMessage(request.error);
  return (
    <FormScreen
      title="Changer d’adresse email"
      intro="Tu recevras un code sur la nouvelle adresse. Rien ne change avant sa saisie."
      onBack={() => router.back()}
    >
      <Input
        label="Nouvelle adresse"
        value={newEmail}
        onChangeText={setNewEmail}
        error={errors.newEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        testID="email-new"
      />
      <Input
        label="Mot de passe actuel"
        value={password}
        onChangeText={setPassword}
        error={errors.currentPassword}
        secureTextEntry
        autoComplete="current-password"
        testID="email-password"
      />
      {apiError != null && (
        <Text testID="email-error" style={[typography.body, { color: theme.textError }]}>
          {apiError}
        </Text>
      )}
      <Button size="lg" fullWidth onPress={sendCode} disabled={request.isPending}>
        {request.isPending ? 'Envoi…' : 'Recevoir un code'}
      </Button>
    </FormScreen>
  );
}
