/**
 * Profile: identity and totals (#7), security (#73, #75), export (#76), athlete profile
 * (#32), preferences including GPS mode (#36), privacy zones (#37), logout, deletion
 * (right to erasure).
 */
import { router } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { exportPersonalData } from '../../core/account/export-data';
import { accountErrorMessage } from '../../core/api/use-account';
import { useDeleteAccount, useProfile } from '../../core/api/use-auth';
import { AllTimeStats } from '../../core/profile/AllTimeStats';
import { DisplayName } from '../../core/profile/DisplayName';
import { PhysicalProfile } from '../../core/profile/PhysicalProfile';
import { PrivacyZones } from '../../core/profile/PrivacyZones';
import { Avatar } from '../../design-system/components/Avatar';
import { Icon } from '../../design-system/components/Icon';
import { useFormat } from '../../core/format/use-format';
import { DEFAULT_PREFERENCES, speedDisplayFor } from '../../core/preferences/schema';
import { usePreferences, useUpdatePreferences } from '../../core/preferences/use-preferences';
import { useSportTypes } from '../../core/api/use-sport-types';
import { sportRegistry } from '../../sports/registry';
import { ErrorState } from '../../design-system/components/ErrorState';
import { LoadingState } from '../../design-system/components/LoadingState';
import { SettingRow } from '../../design-system/components/SettingRow';
import { useAuthStore } from '../../core/auth/use-auth-store';
import { Button } from '../../design-system/components/Button';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import { SafeScreen } from '../../design-system/components/SafeScreen';

/** "septembre 2026": the day adds nothing to a membership date. */
function memberSince(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

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

  // The screen scrolls since #7: with the settings, the content exceeds the available
  // height and the account actions went off screen.
  return (
    <SafeScreen edges={['top']}>
      <ScrollView
        style={{ backgroundColor: theme.surfaceApp }}
        contentContainerStyle={styles.container}
      >
        <Text style={[typography.h2, { color: theme.textPrimary }]}>Profil</Text>

        <View style={styles.header}>
          <Avatar displayName={user?.displayName} email={user?.email} />
          <View style={styles.identity}>
            <DisplayName value={user?.displayName} />
            <Text style={[typography.body, { color: theme.textSecondary }]}>{user?.email ?? '—'}</Text>
            {user != null && (
              // The text carries the information in `textSecondary` (AA contrast); the
              // state colour moves to the icon, which only underlines it (#42).
              <View style={styles.status}>
                <Icon
                  name={user.emailVerified === true ? 'state-privacy' : 'state-warning'}
                  color={user.emailVerified === true ? theme.textSuccess : theme.textWarning}
                  size="sm"
                />
                <Text testID="email-status" style={[typography.body, { color: theme.textSecondary }]}>
                  {user.emailVerified === true ? 'Adresse vérifiée' : 'Adresse non vérifiée'}
                </Text>
              </View>
            )}
            {user?.createdAt != null && (
              <Text testID="member-since" style={[typography.caption, { color: theme.textSecondary }]}>
                Membre depuis {memberSince(user.createdAt)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <AllTimeStats />
        </View>

        <AccountSecurity verified={user?.emailVerified === true} />

        <View style={styles.section}>
          <PhysicalProfile />
        </View>

        <Preferences />

        <View style={styles.section}>
          <PrivacyZones />
        </View>

        <View style={styles.actions}>
          <Button variant="secondary" fullWidth onPress={logout}>
            Se déconnecter
          </Button>
          <Button variant="text" fullWidth onPress={confirmDelete}>
            Supprimer mon compte
          </Button>
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

/**
 * Account section (#73, #75, #76). The input screens live under `app/account/`: a
 * multi-field form has no place in a scrolling settings screen.
 */
function AccountSecurity({ verified }: { verified: boolean }) {
  const theme = useTheme();
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const runExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportPersonalData();
    } catch (error) {
      setExportError(accountErrorMessage(error) ?? 'L’export n’a pas abouti. Réessaie.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.section} testID="account-section">
      <Text style={[typography.h3, { color: theme.textPrimary }]}>Compte</Text>
      {!verified && (
        <Button variant="secondary" fullWidth onPress={() => router.push('/account/verify-email')}>
          Vérifier mon adresse
        </Button>
      )}
      <Button variant="secondary" fullWidth onPress={() => router.push('/account/email')}>
        Changer d’adresse email
      </Button>
      <Button variant="secondary" fullWidth onPress={() => router.push('/account/password')}>
        Changer le mot de passe
      </Button>
      <Button variant="secondary" fullWidth onPress={() => void runExport()} disabled={exporting}>
        {exporting ? 'Préparation de l’export…' : 'Exporter mes données'}
      </Button>
      <Text style={[typography.body, { color: theme.textSecondary }]}>
        Un fichier JSON avec ton profil, tes réglages et toutes tes séances, tracés GPS compris.
      </Text>
      {exportError != null && (
        <Text testID="export-error" style={[typography.body, { color: theme.textError }]}>
          {exportError}
        </Text>
      )}
    </View>
  );
}

const GPS_MODE_HELP: Record<'max' | 'balanced' | 'saver', string> = {
  max: 'Un point à chaque mesure : le tracé le plus fidèle, la batterie la plus sollicitée. S’applique à la prochaine séance.',
  balanced: 'Le réglage de référence : un point tous les 2 m environ. S’applique à la prochaine séance.',
  // iOS ignores expo-location's time interval and only follows distance (PR #80
  // review): so no fixed cadence is promised.
  saver: 'Moins de points (tous les 5 m environ, et au plus un toutes les 3 s sur Android) : devrait économiser la batterie, au prix d’un tracé moins fin dans les virages. S’applique à la prochaine séance.',
};

/**
 * Preferences section (#7, #30, #4, #31).
 *
 * Each change goes out immediately as a partial PATCH: the core (lot C) accepts a patch
 * per key, so there's nothing to recompose on the screen. No "Enregistrer" button: a
 * display setting is judged by seeing it apply.
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

      {/* Otherwise a failed PATCH would bring the chip back to its previous value without
          a word: the user thinks their choice wasn't taken, and tries again. The banner
          can only describe ONE mutation, hence the chips being disabled during the save,
          which guarantees there are never two in flight and so no error is hidden by
          the next one's success. */}
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

      {/* #36. `balanced` reproduces the historical settings; the battery impact of the
          two others isn't measured on a device yet (#18), hence the tentative wording. */}
      <SettingRow
        testID="setting-gps-mode"
        label="Précision GPS"
        helper={GPS_MODE_HELP[current.gpsMode]}
        options={[
          { value: 'max', label: 'Maximale' },
          { value: 'balanced', label: 'Équilibrée' },
          { value: 'saver', label: 'Économie' },
        ]}
        disabled={saving}
        value={current.gpsMode}
        onChange={(gpsMode) => update.mutate({ gpsMode })}
      />

      {/* Goals offered as steps rather than free input: a weekly goal is a round number,
          and numeric input would open the door to values the core rejects (bounds
          100 m – 1,000 km, 1 – 50 sessions). */}
      <SettingRow
        testID="setting-goal-distance"
        label="Objectif hebdomadaire — distance"
        options={[
          { value: '', label: 'Aucun' },
          // The step is stored in metres (SI): the label must go through the formatter,
          // otherwise "10 mi" would actually save 6.2 mi.
          { value: '10000', label: `${format.distance(10000)} ${format.distanceUnit}` },
          { value: '20000', label: `${format.distance(20000)} ${format.distanceUnit}` },
          { value: '40000', label: `${format.distance(40000)} ${format.distanceUnit}` },
        ]}
        disabled={saving}
        value={current.weeklyGoal.distanceM != null ? String(current.weeklyGoal.distanceM) : ''}
        onChange={(v) =>
          update.mutate({
            weeklyGoal: { ...current.weeklyGoal, distanceM: v === '' ? null : Number(v) },
          })
        }
      />

      <SettingRow
        testID="setting-goal-sessions"
        label="Objectif hebdomadaire — séances"
        options={[
          { value: '', label: 'Aucun' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
          { value: '5', label: '5' },
        ]}
        disabled={saving}
        value={current.weeklyGoal.sessions != null ? String(current.weeklyGoal.sessions) : ''}
        onChange={(v) =>
          update.mutate({
            weeklyGoal: { ...current.weeklyGoal, sessions: v === '' ? null : Number(v) },
          })
        }
      />

      {/* "Aucun" is a legitimate value, not a missing setting: it restores the server
          order and preselects nothing. The core accepts `null`. */}
      <SettingRow
        testID="setting-default-sport"
        label="Sport par défaut"
        helper="Présélectionné sur l'accueil et affiché en premier."
        options={[
          { value: '', label: 'Aucun' },
          // Same sports as the home screen: offering a sport without a mobile module would
          // allow making it a default that can't be started.
          ...(sportTypes.data ?? [])
            .filter((s) => sportRegistry[s.code] != null)
            .map((s) => ({ value: s.code, label: s.label })),
        ]}
        disabled={saving}
        value={current.defaultSport ?? ''}
        onChange={(code) => update.mutate({ defaultSport: code === '' ? null : code })}
      />

      {/* Set PER SPORT: a runner reads a pace, a walker a speed. A global setting would
          force one of them to read in the other's mental model. */}
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
          // Only the changed entry is sent: the server deep-merges. Rebuilding the table
          // from `current` would send a snapshot that may be stale, and bring back another
          // sport's earlier choice (#66 review).
          onChange={(display) => update.mutate({ sportDisplay: { [sport.code]: display } })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.layoutGutter, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.xl, gap: spacing.base },
  header: { marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  identity: { flex: 1, gap: spacing.xs },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actions: { marginTop: spacing.xl, gap: spacing.md },
});
