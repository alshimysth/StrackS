/** Profil — infos du compte, déconnexion, suppression (droit à l'effacement). */
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useDeleteAccount, useProfile } from '../../core/api/use-auth';
import { useFormat } from '../../core/format/use-format';
import { DEFAULT_PREFERENCES, speedDisplayFor } from '../../core/preferences/schema';
import { usePreferences, useUpdatePreferences } from '../../core/preferences/use-preferences';
import { useSportTypes } from '../../core/api/use-sport-types';
import { ErrorState } from '../../design-system/components/ErrorState';
import { LoadingState } from '../../design-system/components/LoadingState';
import { SettingRow } from '../../design-system/components/SettingRow';
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

  // L'écran défile depuis #7 : avec les réglages, le contenu dépasse la hauteur
  // disponible et les actions de compte sortaient de l'écran.
  return (
    <ScrollView
      style={{ backgroundColor: theme.surfaceApp }}
      contentContainerStyle={styles.container}
    >
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

      <Preferences />

      <View style={styles.actions}>
        <Button variant="secondary" fullWidth onPress={logout}>
          Se déconnecter
        </Button>
        <Button variant="text" fullWidth onPress={confirmDelete}>
          Supprimer mon compte
        </Button>
      </View>
    </ScrollView>
  );
}

/**
 * Section Préférences (#7, #30, #4, #31).
 *
 * Chaque changement part immédiatement en PATCH partiel : le socle (lot C) accepte un
 * patch par clé, il n'y a donc rien à recomposer côté écran. Pas de bouton
 * « Enregistrer » — un réglage d'affichage se juge en le voyant s'appliquer.
 */
function Preferences() {
  const theme = useTheme();
  const format = useFormat();
  const preferences = usePreferences();
  const update = useUpdatePreferences();
  const sportTypes = useSportTypes();

  if (preferences.isLoading) {
    return <LoadingState message="Chargement de tes réglages" />;
  }
  if (preferences.isError) {
    return <ErrorState error={preferences.error} onRetry={() => void preferences.refetch()} />;
  }

  const current = preferences.data ?? DEFAULT_PREFERENCES;
  const saving = update.isPending;

  return (
    <View style={styles.section} testID="preferences-section">
      <Text style={[typography.h3, { color: theme.textPrimary }]}>Préférences</Text>

      {/* Un PATCH échoué ferait sinon revenir la puce à sa valeur précédente sans un
          mot : l'utilisateur croit que son choix n'a pas été pris, et recommence.
          Le bandeau ne peut décrire qu'UNE mutation — d'où le blocage des puces
          pendant l'enregistrement, qui garantit qu'il n'y en a jamais deux en vol et
          donc qu'aucune erreur n'est masquée par le succès de la suivante. */}
      {update.isError && (
        <ErrorState
          testID="preferences-update-error"
          error={update.error}
          onRetry={() => update.mutate(update.variables)}
        />
      )}

      <SettingRow
        testID="setting-units"
        label="Unités"
        helper={`Distances en ${format.distanceUnit}, dénivelé en ${format.elevationUnit}.`}
        options={[
          { value: 'metric', label: 'Métrique' },
          { value: 'imperial', label: 'Impérial' },
        ]}
        disabled={saving}
        value={current.units}
        onChange={(units) => update.mutate({ units })}
      />

      <SettingRow
        testID="setting-theme"
        label="Thème"
        helper="Le suivi de séance reste sombre : c'est le mode lisible en plein soleil."
        options={[
          { value: 'auto', label: 'Système' },
          { value: 'light', label: 'Clair' },
          { value: 'dark', label: 'Sombre' },
        ]}
        disabled={saving}
        value={current.theme}
        onChange={(next) => update.mutate({ theme: next })}
      />

      {/* Réglé PAR SPORT : un coureur lit une allure, un marcheur une vitesse. Un
          réglage global forcerait l'un des deux à lire dans l'autre modèle mental. */}
      {(sportTypes.data ?? []).map((sport) => (
        <SettingRow
          key={sport.code}
          testID={`setting-display-${sport.code}`}
          label={`Affichage — ${sport.label}`}
          options={[
            { value: 'pace', label: 'Allure' },
            { value: 'speed', label: 'Vitesse' },
          ]}
          disabled={saving}
          value={speedDisplayFor(current, sport.code)}
          // On n'envoie QUE l'entrée modifiée : le serveur fusionne en profondeur.
          // Reconstruire la table depuis `current` propagerait un instantané périmé —
          // les puces restent actionnables pendant qu'un enregistrement est en vol, et
          // un second choix repartirait d'un état d'avant le premier.
          onChange={(display) => update.mutate({ sportDisplay: { [sport.code]: display } })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.layoutGutter, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.xl, gap: spacing.base },
  info: { marginTop: spacing.xl, gap: spacing.xs },
  actions: { marginTop: spacing.xl, gap: spacing.md },
});
