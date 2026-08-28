/**
 * Historique — liste paginée, filtrée côté serveur, lisible hors ligne.
 *
 * Stories #23 (pagination infinie, filtres, pull-to-refresh, groupement par mois),
 * #41 (états partagés) et #27 (cache offline daté).
 *
 * Règle de conception du lot E : **hors ligne n'est pas une erreur**. Tant qu'il
 * reste des données en cache on les affiche en les datant ; l'écran d'erreur est
 * réservé au cas où il n'y a réellement rien à montrer.
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

  // DoD #26 : aucune suppression sans confirmation explicite. Le libellé nomme la
  // séance et dit ce qui part avec elle — « Supprimer ? » seul ne permet pas de
  // vérifier qu'on vise la bonne ligne.
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

      {/* Le bandeau accompagne les données au lieu de les remplacer : la donnée
          périmée reste lisible, mais jamais sans son horodatage (DoD #27). */}
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
  // `isLoading` ne vaut vrai que sans aucune donnée : une réhydratation depuis le
  // cache disque affiche directement la liste, sans écran de chargement.
  if (history.isLoading) {
    return <LoadingState message="Récupération de tes séances" />;
  }

  // L'erreur ne prend l'écran que si le cache est vide — sinon on préfère
  // des données datées à une page blanche.
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
      // Le garde-fou évite de relancer la page suivante à chaque frame de défilement
      // quand une requête est déjà en vol.
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
 * Carte d'historique — cliquable (#6) et supprimable par appui long (#26).
 *
 * L'appui long plutôt qu'un swipe : le swipe demanderait `react-native-gesture-handler`
 * sur une liste sectionnée, et surtout il se déclenche par accident en défilant — pour
 * une action irréversible, c'est le mauvais geste.
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
      <Text style={[typography.caption, { color: theme.textTertiary }]}>
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
