/**
 * History: paginated list, filtered server side, readable offline.
 *
 * Stories #23 (infinite pagination, filters, pull-to-refresh, grouping by month), #41
 * (shared states) and #27 (dated offline cache).
 *
 * Lot E design rule: **offline isn't an error**. As long as cached data remains, it's
 * shown with its date; the error screen is reserved for when there's really nothing to
 * show.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { activityTitle } from '../../core/activity/title';
import { useDeleteActivity } from '../../core/api/use-activity';
import { groupByMonth, useActivities, type PeriodFilter } from '../../core/api/use-activities';
import { useSportTypes } from '../../core/api/use-sport-types';
import { useIsOnline } from '../../core/network/online';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ErrorState } from '../../design-system/components/ErrorState';
import { FilterChips, type ChipOption } from '../../design-system/components/FilterChips';
import { LoadingState } from '../../design-system/components/LoadingState';
import { OfflineBanner } from '../../design-system/components/OfflineBanner';
import { SportBadge } from '../../design-system/components/SportBadge';
import { radius, shadows, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import { useFormat } from '../../core/format/use-format';
import type { Activity } from '../../types/api';
import { SafeScreen } from '../../design-system/components/SafeScreen';

const PERIOD_OPTIONS: ChipOption<PeriodFilter>[] = [
  { value: 'all', label: 'Tout' },
  { value: 'week', label: '7 jours' },
  { value: 'month', label: '30 jours' },
  { value: 'year', label: '12 mois' },
];

const ALL_SPORTS = 'all';

export default function HistoryScreen() {
  const theme = useTheme();
  const isOnline = useIsOnline();

  const [sport, setSport] = React.useState<string>(ALL_SPORTS);
  const [period, setPeriod] = React.useState<PeriodFilter>('all');
  const isFiltered = sport !== ALL_SPORTS || period !== 'all';

  const sportTypes = useSportTypes();
  const history = useActivities({
    sport: sport === ALL_SPORTS ? undefined : sport,
    period,
  });

  const activities: Activity[] = React.useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data],
  );
  const sections = React.useMemo(() => groupByMonth(activities), [activities]);

  const sportOptions: ChipOption<string>[] = [
    { value: ALL_SPORTS, label: 'Tous' },
    ...(sportTypes.data ?? []).map((s) => ({ value: s.code, label: s.label })),
  ];

  const resetFilters = () => {
    setSport(ALL_SPORTS);
    setPeriod('all');
  };

  const router = useRouter();
  const remove = useDeleteActivity();

  // DoD #26: no deletion without explicit confirmation. The label names the session and
  // says what goes with it: "Supprimer ?" alone doesn't let the user check they target the
  // right row.
  const confirmDelete = (activity: Activity) => {
    Alert.alert(
      'Supprimer cette séance ?',
      `« ${activityTitle(activity)} » et son tracé GPS seront définitivement effacés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () =>
            remove.mutate(activity.id, {
              onError: () =>
                Alert.alert(
                  'Suppression impossible',
                  'La séance est toujours là. Vérifie ta connexion et réessaie.',
                ),
            }),
        },
      ],
    );
  };

  return (
    <SafeScreen edges={['top']}>
      <View style={[styles.container, { backgroundColor: theme.surfaceApp }]}>
        <Text style={[typography.h2, { color: theme.textPrimary }]}>Historique</Text>

        <View style={styles.filters}>
          <FilterChips
            options={sportOptions}
            value={sport}
            onChange={setSport}
            accessibilityLabel="Filtrer par sport"
          />
          <FilterChips
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            accessibilityLabel="Filtrer par période"
          />
        </View>

        {/* The banner accompanies the data instead of replacing it: stale data stays
            readable, but never without its timestamp (DoD #27). */}
        {!isOnline && activities.length > 0 && (
          <OfflineBanner lastUpdatedAt={history.dataUpdatedAt} />
        )}

        <Body
          history={history}
          sections={sections}
          isEmpty={activities.length === 0}
          isFiltered={isFiltered}
          onResetFilters={resetFilters}
          theme={theme}
          onOpen={(activity) => router.push(`/activity/${activity.id}`)}
          onDelete={confirmDelete}
        />
      </View>
    </SafeScreen>
  );
}

type HistoryQuery = ReturnType<typeof useActivities>;

interface BodyProps {
  history: HistoryQuery;
  sections: ReturnType<typeof groupByMonth>;
  isEmpty: boolean;
  isFiltered: boolean;
  onResetFilters: () => void;
  theme: ReturnType<typeof useTheme>;
  onOpen: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
}

function Body({
  history,
  sections,
  isEmpty,
  isFiltered,
  onResetFilters,
  theme,
  onOpen,
  onDelete,
}: BodyProps) {
  // `isLoading` is only true without any data: rehydrating from the disk cache shows the
  // list directly, without a loading screen.
  if (history.isLoading) {
    return <LoadingState message="Récupération de tes séances" />;
  }

  // The error only takes the screen if the cache is empty; otherwise dated data is
  // preferred to a blank page.
  if (history.isError && isEmpty) {
    return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  }

  if (isEmpty) {
    return isFiltered ? (
      <EmptyState
        variant="filtered"
        title="Aucune séance sur cette période"
        message="Élargis la période ou change de sport pour retrouver tes séances."
        action={
          <Text
            testID="reset-filters"
            onPress={onResetFilters}
            style={[typography.bodyLg, { color: theme.textPrimary }]}
          >
            Effacer les filtres
          </Text>
        }
      />
    ) : (
      <EmptyState
        variant="initial"
        title="Pas encore de séance"
        message="Ta première sortie apparaîtra ici. Démarre-la depuis l'accueil."
      />
    );
  }

  return (
    <SectionList
      testID="history-list"
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={history.isRefetching && !history.isFetchingNextPage}
          onRefresh={() => void history.refetch()}
          tintColor={theme.textSecondary}
        />
      }
      // The guard avoids requesting the next page again on every scroll frame when a
      // request is already in flight.
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (history.hasNextPage && !history.isFetchingNextPage) {
          void history.fetchNextPage();
        }
      }}
      renderSectionHeader={({ section }) => (
        <Text style={[typography.label, styles.sectionHeader, { color: theme.textSecondary }]}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <ActivityCard
          activity={item}
          theme={theme}
          onOpen={() => onOpen(item)}
          onDelete={() => onDelete(item)}
        />
      )}
      ListFooterComponent={
        history.isFetchingNextPage ? <LoadingState title="" testID="loading-next-page" /> : null
      }
    />
  );
}

/**
 * History card: tappable (#6) and deletable with a long press (#26).
 *
 * Long press rather than a swipe: a swipe would require `react-native-gesture-handler` on
 * a sectioned list, and above all it triggers by accident while scrolling; for an
 * irreversible action, it's the wrong gesture.
 */
function ActivityCard({
  activity,
  theme,
  onOpen,
  onDelete,
}: {
  activity: Activity;
  theme: ReturnType<typeof useTheme>;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const format = useFormat();
  return (
    <Pressable
      testID={`activity-card-${activity.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${activityTitle(activity)}, voir le détail`}
      onPress={onOpen}
      onLongPress={onDelete}
      style={({ pressed }) => [
        styles.card,
        shadows.card,
        {
          backgroundColor: theme.surfaceCard,
          borderColor: theme.borderSubtle,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <SportBadge sport={activity.sportType} size="sm" />
      <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>
        {activityTitle(activity)}
      </Text>
      <Text style={[typography.h3, { color: theme.textPrimary }]}>
        {activity.distanceM != null
          ? `${format.distance(Number(activity.distanceM))} ${format.distanceUnit}`
          : '—'}
        {activity.durationS != null ? `  ·  ${format.duration(activity.durationS)}` : ''}
      </Text>
      <Text style={[typography.caption, { color: theme.textSecondary }]}>
        {new Date(activity.startedAt).toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.layoutGutter },
  filters: { gap: spacing.xs, marginTop: spacing.md },
  list: { gap: spacing.md, paddingVertical: spacing.lg },
  sectionHeader: { marginTop: spacing.sm, textTransform: 'uppercase' },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
