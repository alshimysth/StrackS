/**
 * Résumé de fin de séance (#22) — le premier écran après l'effort, moment le plus
 * fort du produit.
 *
 * Partage son fond avec le détail d'archive via `ActivityDetailBody` ; ce qui lui est
 * propre : la célébration volt et la sortie qui renvoie à l'accueil plutôt qu'en
 * arrière (on ne « revient » pas dans un écran de tracking terminé).
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityDetailBody } from '../../core/activity/ActivityDetailBody';
import { activityTitle, derivedTitle, sportLabel } from '../../core/activity/title';
import { api } from '../../core/api/client';
import { useActivity, useUpdateActivity } from '../../core/api/use-activity';
import { ActivityEditor } from '../../design-system/components/ActivityEditor';
import { Button } from '../../design-system/components/Button';
import { CelebrationBanner } from '../../design-system/components/CelebrationBanner';
import { ErrorState } from '../../design-system/components/ErrorState';
import { LoadingState } from '../../design-system/components/LoadingState';
import { SportBadge } from '../../design-system/components/SportBadge';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import type { Activity, Page } from '../../types/api';
import { useStatsSummary } from '../../core/api/use-stats';
import { usePreferences } from '../../core/preferences/use-preferences';
import { goalJustReached } from '../../core/preferences/weekly-goal';

/**
 * Une requête peut-elle servir à conclure sur la séance qui vient de se terminer (#69) ?
 *
 * Les deux raisons de célébrer se lisent dans des caches partagés : les totaux de la
 * semaine ont la même clé que la carte d'objectif de l'accueil, et la sonde « première
 * séance » a pu être remplie par un résumé précédent. Lus tels quels, ils décrivent le
 * monde **d'avant** la séance — et un objectif déjà atteint se remettait à clignoter
 * en volt à la séance suivante.
 *
 * Deux gardes, parce qu'aucune ne suffit seule :
 * - `isFetching` : le moteur de séance invalide `['stats']` et `['activities']` après un
 *   `stop()` réussi, un refetch est donc en vol à l'arrivée sur cet écran ;
 * - `dataUpdatedAt` postérieur à `endedAt` : une donnée plus ancienne que la fin de la
 *   séance ne peut pas la contenir, invalidée ou non. `endedAt` est l'horloge de
 *   l'appareil (le serveur le reprend tel quel) : on compare deux instants du même
 *   téléphone. C'est aussi ce qui rend une séance de moins de 30 s (`staleTime`) sûre.
 *
 * Tant que ce n'est pas établi, on ne conclut rien — ne pas célébrer vaut toujours
 * mieux que célébrer à tort.
 */
function isFreshFor(
  query: Pick<UseQueryResult, 'isPending' | 'isFetching' | 'dataUpdatedAt'>,
  activity: Pick<Activity, 'endedAt'>,
): boolean {
  if (query.isPending || query.isFetching || activity.endedAt == null) {
    return false;
  }
  return query.dataUpdatedAt >= Date.parse(activity.endedAt);
}

/**
 * Première séance du sport ? Une page de taille 1 suffit : seul `total` est lu.
 *
 * C'est la seule raison de célébrer qui soit **exacte** sans nouvel endpoint. Les
 * records de distance et les objectifs hebdomadaires supposent une agrégation serveur
 * qui n'existe pas (Epic 6 / lot H) — et célébrer un record incertain serait pire que
 * ne rien célébrer.
 */
function useIsFirstSession(sportType: string | undefined) {
  return useQuery({
    queryKey: ['activities', sportType ?? 'all', 'first-session-probe'],
    queryFn: () =>
      api<Page<Activity>>(`/api/v1/activities?page=0&size=1&sport=${sportType as string}`),
    enabled: sportType != null,
    select: (page) => page.total === 1,
  });
}

/**
 * Cette séance vient-elle de faire franchir un objectif hebdomadaire (#35) ?
 *
 * L'état « avant » se reconstruit en retranchant la séance des totaux de la semaine :
 * c'est la seule façon de distinguer « l'objectif est atteint » de « cette séance
 * vient de l'atteindre ». Sans cette nuance, la célébration rejouerait à chaque
 * séance jusqu'à la fin de la semaine.
 */
function useGoalJustReached(activity: Activity | undefined): boolean {
  const preferences = usePreferences();
  const stats = useStatsSummary({ period: 'week', sport: undefined });

  const goal = preferences.data?.weeklyGoal;
  if (activity == null || goal == null || stats.data == null || !isFreshFor(stats, activity)) {
    return false;
  }

  /**
   * La requête porte sur la semaine COURANTE, alors que le backend agrège par
   * `startedAt`. Une séance à cheval sur un changement de semaine — commencée
   * dimanche soir, consultée lundi — n'est donc pas dans `after` ; la retrancher
   * quand même fabriquerait un « avant » plus bas que la réalité et déclencherait
   * une fausse célébration. Hors fenêtre, on ne conclut rien.
   */
  const startedAt = Date.parse(activity.startedAt);
  const from = Date.parse(stats.data.from);
  const to = Date.parse(stats.data.to);
  if (!(startedAt >= from && startedAt < to)) {
    return false;
  }
  const after = {
    distanceM: stats.data.totals.distanceM ?? 0,
    sessions: stats.data.totalSessions,
  };
  const before = {
    distanceM: Math.max(0, after.distanceM - Number(activity.distanceM ?? 0)),
    sessions: Math.max(0, after.sessions - 1),
  };
  return goalJustReached(before, after, goal);
}

export default function SummaryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const activityQuery = useActivity(id);
  const update = useUpdateActivity(id as string);
  const [editing, setEditing] = React.useState(false);

  const activity = activityQuery.data;
  const firstSession = useIsFirstSession(activity?.sportType);
  const goalReached = useGoalJustReached(activity);
  const firstSessionSettled = activity != null && isFreshFor(firstSession, activity);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surfaceApp }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[typography.h2, { color: theme.textPrimary }]}>Séance terminée</Text>

        {activityQuery.isLoading && <LoadingState message="Calcul de tes métriques" />}
        {activityQuery.isError && (
          <ErrorState error={activityQuery.error} onRetry={() => void activityQuery.refetch()} />
        )}

        {activity != null && (
          <>
            {/* Une seule célébration à la fois : deux bandeaux volt côte à côte
                diluent exactement ce qu'ils sont censés souligner. La première
                séance prime — elle ne se produit qu'une fois. */}
            {/* Rien tant que la première requête n'a pas tranché sur une donnée
                postérieure à la séance : sinon le bandeau « objectif » s'affiche puis
                cède la place à « première séance », ou une sonde en cache fête une
                première séance qui n'en est plus une (#69). */}
            {!firstSessionSettled ? null : firstSession.data === true ? (
              <CelebrationBanner
                reason="first-session"
                sportLabel={sportLabel(activity.sportType)}
              />
            ) : (
              goalReached && (
                <CelebrationBanner
                  reason="weekly-goal"
                  sportLabel={sportLabel(activity.sportType)}
                />
              )
            )}

            <SportBadge sport={activity.sportType} />
            <Text testID="activity-title" style={[typography.h3, { color: theme.textPrimary }]}>
              {activityTitle(activity)}
            </Text>

            <ActivityDetailBody activity={activity} />

            <View style={styles.actions}>
              <Button variant="secondary" onPress={() => setEditing(true)}>
                Renommer
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

        <Button size="lg" fullWidth onPress={() => router.replace('/(tabs)')}>
          Terminer
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.layoutGutter, gap: spacing.base },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
