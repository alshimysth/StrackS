/**
 * Profil — identité et totaux (#7), sécurité (#73, #75), export (#76), profil physique
 * (#32), préférences dont le mode GPS (#36), zones de confidentialité (#37), déconnexion,
 * suppression (droit à l'effacement).
 */
import { router } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { exportPersonalData } from '../../core/account/export-data';
import { accountErrorMessage } from '../../core/api/use-account';
import { useDeleteAccount, useProfile } from '../../core/api/use-auth';
import { AllTimeStats } from '../../core/profile/AllTimeStats';
import { PhysicalProfile } from '../../core/profile/PhysicalProfile';
import { PrivacyZones } from '../../core/profile/PrivacyZones';
import { Avatar } from '../../design-system/components/Avatar';
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

/** « septembre 2026 » : le jour n'apporte rien à une ancienneté. */
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

  // L'écran défile depuis #7 : avec les réglages, le contenu dépasse la hauteur
  // disponible et les actions de compte sortaient de l'écran.
  return (
    <ScrollView
      style={{ backgroundColor: theme.surfaceApp }}
      contentContainerStyle={styles.container}
    >
      <Text style={[typography.h2, { color: theme.textPrimary }]}>Profil</Text>

      <View style={styles.header}>
        <Avatar displayName={user?.displayName} email={user?.email} />
        <View style={styles.identity}>
          <Text style={[typography.h3, { color: theme.textPrimary }]}>
            {user?.displayName ?? '—'}
          </Text>
          <Text style={[typography.body, { color: theme.textSecondary }]}>{user?.email ?? '—'}</Text>
          {user != null && (
            <Text
              testID="email-status"
              style={[
                typography.body,
                { color: user.emailVerified === true ? theme.textSuccess : theme.textWarning },
              ]}
            >
              {user.emailVerified === true ? 'Adresse vérifiée' : 'Adresse non vérifiée'}
            </Text>
          )}
          {user?.createdAt != null && (
            <Text testID="member-since" style={[typography.caption, { color: theme.textTertiary }]}>
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
  );
}

/**
 * Section Compte (#73, #75, #76). Les écrans de saisie vivent sous `app/account/` : un
 * formulaire à plusieurs champs n'a pas sa place dans un écran de réglages qui défile.
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
  balanced: 'Le réglage de référence : un point par seconde. S’applique à la prochaine séance.',
  saver: 'Un point toutes les 3 s environ : devrait économiser la batterie, au prix d’un tracé moins fin dans les virages. S’applique à la prochaine séance.',
};

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

      {/* #36. `balanced` reproduit les réglages historiques ; l'impact batterie des deux
          autres n'est pas encore mesuré sur device (#18) — d'où le conditionnel. */}
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

      {/* Objectifs proposés par paliers plutôt qu'en saisie libre : un objectif
          hebdomadaire est un nombre rond, et une saisie numérique ouvrirait la porte
          aux valeurs que le socle rejette (bornes 100 m – 1 000 km, 1 – 50 séances). */}
      <SettingRow
        testID="setting-goal-distance"
        label="Objectif hebdomadaire — distance"
        options={[
          { value: '', label: 'Aucun' },
          // Le palier est stocké en mètres (SI) : le libellé doit passer par le
          // formateur, sinon « 10 mi » enregistrerait en réalité 6,2 mi.
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

      {/* « Aucun » est une valeur légitime, pas une absence de réglage : elle rend
          l'ordre serveur et ne présélectionne rien. Le socle accepte `null`. */}
      <SettingRow
        testID="setting-default-sport"
        label="Sport par défaut"
        helper="Présélectionné sur l'accueil et affiché en premier."
        options={[
          { value: '', label: 'Aucun' },
          // Mêmes sports que l'accueil : proposer un sport sans module mobile
          // permettrait d'en faire un défaut qu'on ne peut pas démarrer.
          ...(sportTypes.data ?? [])
            .filter((s) => sportRegistry[s.code] != null)
            .map((s) => ({ value: s.code, label: s.label })),
        ]}
        disabled={saving}
        value={current.defaultSport ?? ''}
        onChange={(code) => update.mutate({ defaultSport: code === '' ? null : code })}
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
  header: { marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  identity: { flex: 1, gap: spacing.xs },
  actions: { marginTop: spacing.xl, gap: spacing.md },
});
