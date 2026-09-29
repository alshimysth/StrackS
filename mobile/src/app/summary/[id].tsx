/**
 * End-of-session summary (#22): the first screen after the effort, the product's
 * strongest moment.
 *
 * Shares its body with the archive detail through `ActivityDetailBody`; what's specific
 * to it: the volt celebration and the exit going to the home screen rather than back
 * (nobody "goes back" into a finished tracking screen).
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
import { usePersonalRecords, useStatsSummary } from '../../core/api/use-stats';
import { usePreferences } from '../../core/preferences/use-preferences';
import { goalJustReached } from '../../core/preferences/weekly-goal';

/**
 * Can a query be used to draw conclusions about the session that just ended (#69)?
 *
 * Both reasons to celebrate are read from shared caches: the week's totals have the same
 * key as the home screen's goal card, and the "first session" probe may have been filled
 * by a previous summary. Read as is, they describe the world **before** the session, and
 * an already reached goal started flashing volt again on the next session.
 *
 * Two guards, because neither is enough alone:
 * - `isFetching`: the session engine invalidates `['stats']` and `['activities']` after a
 *   successful `stop()`, so a refetch is in flight when arriving on this screen;
 * - `dataUpdatedAt` later than `endedAt`: data older than the end of the session can't
 *   contain it, invalidated or not. `endedAt` is the device clock (the server takes it
 *   as is): we compare two instants of the same phone. It's also what makes a session
 *   shorter than 30 s (`staleTime`) safe.
 *
 * Until that's established, nothing is concluded: not celebrating is always better than
 * celebrating wrongly.
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
 * First session of the sport? A page of size 1 is enough: only `total` is read.
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
 * Did this session just cross a weekly goal (#35)?
 *
 * The "before" state is rebuilt by subtracting the session from the week's totals: it's
 * the only way to tell "the goal is reached" from "this session just reached it".
 * Without this nuance, the celebration would replay on every session until the end of
 * the week.
 */
function useGoalJustReached(activity: Activity | undefined): boolean {
  const preferences = usePreferences();
  const stats = useStatsSummary({ period: 'week', sport: undefined });

  const goal = preferences.data?.weeklyGoal;
  if (activity == null || goal == null || stats.data == null || !isFreshFor(stats, activity)) {
    return false;
  }

  /**
   * The query covers the CURRENT week, whereas the backend aggregates by `startedAt`. A
   * session straddling a week change (started Sunday evening, viewed Monday) is therefore
   * not in `after`; subtracting it anyway would make up a "before" lower than reality and
   * trigger a false celebration. Outside the window, nothing is concluded.
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

/**
 * Records broken by THIS session (#61). The server designates each record's holder over
 * the whole history: the screen only checks that it's this session.
 *
 * `settled` stays false until the response is later than the session (same guard as
 * #69): a record read from an older cache would designate the previous holder.
 */
function useRecordsBroken(activity: Activity | undefined): { settled: boolean; labels: string[] } {
  const records = usePersonalRecords(activity?.sportType);
  if (activity == null) {
    return { settled: false, labels: [] };
  }
  // Records unreachable (offline, outage): no record is celebrated, but the other reasons
  // aren't blocked either; they have their own data.
  if (records.isError && !records.isFetching) {
    return { settled: true, labels: [] };
  }
  if (!isFreshFor(records, activity)) {
    return { settled: false, labels: [] };
  }
  const sport = records.data?.bySport.find((s) => s.sportType === activity.sportType);
  // A first session necessarily holds every record: that's the other celebration.
  if (sport == null || sport.sessions <= 1) {
    return { settled: true, labels: [] };
  }
  return {
    settled: true,
    labels: sport.records.filter((r) => r.activityId === activity.id).map((r) => r.label),
  };
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
  const recordsBroken = useRecordsBroken(activity);

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
            {/* One celebration at a time: two volt banners side by side dilute exactly
                what they're meant to underline. The rarest wins: the first session (once
                per sport), then the record, then the weekly goal (which comes back every
                week). */}
            {/* Nothing until the first query has decided on data later than the session:
                otherwise the "goal" banner shows then gives way to "first session", or a
                cached probe celebrates a first session that no longer is one (#69). */}
            {!firstSessionSettled || !recordsBroken.settled ? null : firstSession.data === true ? (
              <CelebrationBanner
                reason="first-session"
                sportLabel={sportLabel(activity.sportType)}
              />
            ) : recordsBroken.labels.length > 0 ? (
              <CelebrationBanner
                reason="personal-record"
                sportLabel={sportLabel(activity.sportType)}
                records={recordsBroken.labels}
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
