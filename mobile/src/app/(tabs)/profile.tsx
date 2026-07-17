/** Profil — infos du compte, déconnexion, suppression (droit à l'effacement). */
import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useDeleteAccount, useProfile } from '../../core/api/use-auth';
import { useAuthStore } from '../../core/auth/use-auth-store';
import { Button } from '../../design-system/components/Button';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const profile = useProfile();
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useDeleteAccount();

  const user = profile.data ?? useAuthStore.getState().user;

  const confirmDelete = () => {
    Alert.alert(
      'Supprimer le compte',
      'Toutes tes séances et tes tracés seront définitivement effacés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deleteAccount.mutate(),
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceApp }]}>
      <Text style={[typography.h2, { color: theme.textPrimary }]}>Profil</Text>

      <View style={styles.info}>
        <Text style={[typography.label, { color: theme.textSecondary }]}>Nom affiché</Text>
        <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>
          {user?.displayName ?? '—'}
        </Text>
        <Text style={[typography.label, { color: theme.textSecondary, marginTop: spacing.md }]}>
          Email
        </Text>
        <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>{user?.email ?? '—'}</Text>
      </View>

      <View style={styles.actions}>
        <Button variant="secondary" fullWidth onPress={logout}>
          Se déconnecter
        </Button>
        <Button variant="text" fullWidth onPress={confirmDelete}>
          Supprimer mon compte
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.layoutGutter },
  info: { marginTop: spacing.xl, gap: spacing.xs },
  actions: { marginTop: 'auto', marginBottom: spacing.xl, gap: spacing.md },
});
