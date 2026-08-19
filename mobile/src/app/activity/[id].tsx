/**
 * Détail d'une activité terminée (#6) — consultation depuis l'historique.
 *
 * Distinct du résumé de fin de séance (#22) : pas de célébration, pas de « Terminer »
 * qui renvoie à l'accueil, mais un retour arrière normal et les actions d'archive
 * (renommer, supprimer). Le fond est partagé via `ActivityDetailBody`.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityDetailBody } from '../../core/activity/ActivityDetailBody';
import { activityTitle, derivedTitle } from '../../core/activity/title';
import { useActivity, useDeleteActivity, useUpdateActivity } from '../../core/api/use-activity';
import { ActivityEditor } from '../../design-system/components/ActivityEditor';
import { Button } from '../../design-system/components/Button';
import { ErrorState } from '../../design-system/components/ErrorState';
import { LoadingState } from '../../design-system/components/LoadingState';
import { SportBadge } from '../../design-system/components/SportBadge';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export default function ActivityDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const activityQuery = useActivity(id);
  const update = useUpdateActivity(id as string);
  const remove = useDeleteActivity();
  const [editing, setEditing] = React.useState(false);

  const activity = activityQuery.data;

  const confirmDelete = () => {
    Alert.alert(
      'Supprimer cette séance ?',
      'Le tracé GPS et les métriques seront définitivement effacés. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            remove.mutate(id as string, {
              // On ne quitte l'écran qu'une fois la suppression confirmée par le
              // serveur : revenir tout de suite puis échouer laisserait la séance
              // réapparaître dans l'historique sans explication.
              onSuccess: () => router.back(),
              onError: () =>
                Alert.alert(
                  'Suppression impossible',
                  'La séance est toujours là. Vérifie ta connexion et réessaie.',
                ),
            });
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surfaceApp }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable
          testID="back"
          accessibilityRole="button"
          accessibilityLabel="Retour"
          onPress={() => router.back()}
        >
          <Text style={[typography.bodyLg, { color: theme.textSecondary }]}>‹ Retour</Text>
        </Pressable>

        {activityQuery.isLoading && <LoadingState message="Récupération de la séance" />}
        {activityQuery.isError && (
          <ErrorState error={activityQuery.error} onRetry={() => void activityQuery.refetch()} />
        )}

        {activity != null && (
          <>
            <SportBadge sport={activity.sportType} />
            <Text testID="activity-title" style={[typography.h2, { color: theme.textPrimary }]}>
              {activityTitle(activity)}
            </Text>
            <Text style={[typography.caption, { color: theme.textTertiary }]}>
              {new Date(activity.startedAt).toLocaleString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>

            <ActivityDetailBody activity={activity} />

            <View style={styles.actions}>
              <Button variant="secondary" onPress={() => setEditing(true)}>
                Modifier
              </Button>
              <Button variant="text" onPress={confirmDelete} disabled={remove.isPending}>
                {remove.isPending ? 'Suppression…' : 'Supprimer'}
              </Button>
            </View>

            <ActivityEditor
              visible={editing}
              initialTitle={activity.title}
              initialNotes={activity.notes}
              titlePlaceholder={derivedTitle(activity.sportType, activity.startedAt)}
              saving={update.isPending}
              onCancel={() => setEditing(false)}
              onSave={(patch) => {
                update.mutate(patch);
                setEditing(false);
              }}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.layoutGutter, gap: spacing.base },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
});
