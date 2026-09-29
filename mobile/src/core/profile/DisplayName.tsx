/**
 * Nom affiché, modifiable depuis le profil (#7, suggestion 5). Le `PATCH /users/me`
 * existait depuis le socle ; il manquait l'écran.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { accountErrorMessage, displayNameSchema, useUpdateDisplayName } from '../api/use-account';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export function DisplayName({ value }: { value: string | null | undefined }) {
  const theme = useTheme();
  const update = useUpdateDisplayName();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  const open = () => {
    setDraft(value ?? '');
    setError(undefined);
    update.reset();
    setEditing(true);
  };

  const save = () => {
    const parsed = displayNameSchema.safeParse({ displayName: draft });
    if (!parsed.success) {
      setError(parsed.error.flatten().fieldErrors.displayName?.[0]);
      return;
    }
    update.mutate(parsed.data, { onSuccess: () => setEditing(false) });
  };

  if (!editing) {
    return (
      <View style={styles.row}>
        <Text testID="display-name" style={[typography.h3, styles.name, { color: theme.textPrimary }]}>
          {value ?? '—'}
        </Text>
        <Button variant="text" onPress={open} accessibilityHint="Modifier le nom affiché">
          Modifier
        </Button>
      </View>
    );
  }

  const apiError = accountErrorMessage(update.error);
  return (
    <View style={styles.editor}>
      <Input
        label="Nom affiché"
        value={draft}
        onChangeText={(next) => {
          // Une erreur ne doit pas rester à côté d'une saisie qu'on est en train de corriger.
          setDraft(next);
          setError(undefined);
          update.reset();
        }}
        error={error ?? apiError ?? undefined}
        helper="Laisse vide pour ne pas afficher de nom."
        autoCapitalize="words"
        maxLength={80}
        testID="display-name-input"
      />
      <View style={styles.row}>
        <Button variant="secondary" onPress={save} disabled={update.isPending}>
          {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button variant="text" onPress={() => setEditing(false)} disabled={update.isPending}>
          Annuler
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  editor: { gap: spacing.sm },
});
