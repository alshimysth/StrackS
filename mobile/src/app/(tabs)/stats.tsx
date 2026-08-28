/**
 * Statistiques — 4e onglet (#24).
 *
 * Deux décisions de conception structurent cet écran :
 *
 * 1. **Onglet dédié, pas une section du profil.** Le PRD promet « comprendre ta
 *    progression » ; enterrer les stats dans les réglages les rendrait invisibles.
 * 2. **Tout est agrégé côté serveur.** L'écran ne connaît aucune règle de calcul :
 *    il affiche ce que `/stats/summary` et `/stats/timeline` renvoient. C'est la
 *    DoD (« les chiffres correspondent exactement à la réponse ») et c'est ce qui
 *    tient le budget de latence de #28.
 *
 * Aucune métrique n'est codée en dur : le socle backend ne nomme que le nombre de
 * séances et la durée, les plugins déclarent le reste sous `totals`. Une carte
 * n'apparaît donc que si la clé correspondante est présente — c'est ce qui fait
 * que l'écran reste juste le jour où un sport sans distance arrive (#46).
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  canGoForward,
  chartTitle,
  deltaPercent,
  formatDelta,
  periodTitle,
  shiftAnchor,
  useStatsSummary,
  useStatsTimeline,
  type StatsPeriod,
} from '../../core/api/use-stats';
import { useSportTypes } from '../../core/api/use-sport-types';
import { useIsOnline } from '../../core/network/online';
import { DistanceBarChart } from '../../design-system/components/DistanceBarChart';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ErrorState } from '../../design-system/components/ErrorState';
import { FilterChips, type ChipOption } from '../../design-system/components/FilterChips';
import { LoadingState } from '../../design-system/components/LoadingState';
import { OfflineBanner } from '../../design-system/components/OfflineBanner';
import { StatCard } from '../../design-system/components/StatCard';
import { radius, shadows, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import { useFormat } from '../../core/format/use-format';
import type { StatsSummary } from '../../types/api';

const PERIOD_OPTIONS: ChipOption<StatsPeriod>[] = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' },
];

const ALL_SPORTS = 'all';

export default function StatsScreen() {
  const theme = useTheme();
  const isOnline = useIsOnline();

  const [period, setPeriod] = React.useState<StatsPeriod>('month');
  const [anchor, setAnchor] = React.useState<Date>(() => new Date());
  const [sport, setSport] = React.useState<string>(ALL_SPORTS);

  const sportTypes = useSportTypes();
  const sportOptions: ChipOption<string>[] = [
    { value: ALL_SPORTS, label: 'Tous' },
    ...(sportTypes.data ?? []).map((s) => ({ value: s.code, label: s.label })),
  ];

  // Le filtre part au serveur, jamais appliqué sur place : agréger localement
  // demanderait de rapatrier les séances, ce que cet écran ne fait pas.
  const query = { period, anchor, sport: sport === ALL_SPORTS ? undefined : sport };
  const summary = useStatsSummary(query);
  const timeline = useStatsTimeline(query);

  // Changer de maille remet sur la période courante : garder l'ancre ferait
  // passer de « juillet » à « semaine du 15 juillet », ce que personne n'a demandé.
  const changePeriod = (next: StatsPeriod) => {
    setPeriod(next);
    setAnchor(new Date());
  };

  const forward = canGoForward(period, anchor);

  return (
    <ScrollView
      style={{ backgroundColor: theme.surfaceApp }}
      contentContainerStyle={styles.container}
      testID="stats-screen"
    >
      <Text style={[typography.h2, { color: theme.textPrimary }]}>Statistiques</Text>

      <View style={styles.filters}>
        <FilterChips
          options={PERIOD_OPTIONS}
          value={period}
          onChange={changePeriod}
          accessibilityLabel="Choisir la période"
        />
        <FilterChips
          options={sportOptions}
          value={sport}
          onChange={setSport}
          accessibilityLabel="Filtrer par sport"
        />
      </View>

      <View style={styles.periodNav}>
        <NavArrow
          direction="prev"
          onPress={() => setAnchor(shiftAnchor(period, anchor, -1))}
          enabled
        />
        <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>
          {periodTitle(period, anchor)}
        </Text>
        <NavArrow
          direction="next"
          onPress={() => setAnchor(shiftAnchor(period, anchor, 1))}
          enabled={forward}
        />
      </View>

      {!isOnline && summary.data != null && (
        <OfflineBanner lastUpdatedAt={summary.dataUpdatedAt} />
      )}

      <Body summary={summary} timeline={timeline} />
    </ScrollView>
  );
}

function NavArrow({
  direction,
  onPress,
  enabled,
}: {
  direction: 'prev' | 'next';
  onPress: () => void;
  enabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={`period-${direction}`}
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      accessibilityLabel={direction === 'prev' ? 'Période précédente' : 'Période suivante'}
      hitSlop={12}
    >
      <Text
        style={[
          typography.h3,
          { color: enabled ? theme.textSecondary : theme.borderSubtle },
        ]}
      >
        {direction === 'prev' ? '‹' : '›'}
      </Text>
    </Pressable>
  );
}

type SummaryQuery = ReturnType<typeof useStatsSummary>;
type TimelineQuery = ReturnType<typeof useStatsTimeline>;

function Body({ summary, timeline }: { summary: SummaryQuery; timeline: TimelineQuery }) {
  const theme = useTheme();
  const format = useFormat();

  if (summary.isLoading) {
    return <LoadingState message="Calcul de tes totaux" />;
  }

  // Comme sur l'historique : l'erreur ne prend l'écran que si le cache est vide.
  if (summary.isError && summary.data == null) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  const data = summary.data;
  if (data == null) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  if (data.totalSessions === 0) {
    return (
      <EmptyState
        variant="filtered"
        title="Aucune séance sur cette période"
        message="Change de période pour retrouver tes totaux, ou pars courir."
      />
    );
  }

  const labels = Object.fromEntries(data.bySport.map((s) => [s.sportType, s.label]));

  return (
    <View style={styles.body}>
      <Totals data={data} />

      <View style={[styles.card, shadows.card, cardSkin(theme)]}>
        <Text style={[typography.h3, { color: theme.textPrimary }]}>
          {chartTitle(timeline.data?.bucket ?? 'week')}
        </Text>
        <Text style={[typography.caption, styles.cardCaption, { color: theme.textSecondary }]}>
          en kilomètres
        </Text>

        {timeline.isLoading && <LoadingState title="" testID="chart-loading" />}
        {timeline.data != null && (
          <DistanceBarChart timeline={timeline.data} labels={labels} />
        )}
        {timeline.isError && timeline.data == null && (
          <Text style={[typography.body, { color: theme.textSecondary }]}>
            Le détail par intervalle n’a pas pu être chargé.
          </Text>
        )}
      </View>

      <View style={[styles.card, shadows.card, cardSkin(theme)]}>
        <Text style={[typography.label, styles.cardCaption, { color: theme.textSecondary }]}>
          Par sport
        </Text>
        {data.bySport.map((sport) => (
          <View key={sport.sportType} style={styles.sportRow} testID={`sport-row-${sport.sportType}`}>
            <View style={styles.sportLhs}>
              <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>{sport.label}</Text>
              <Text style={[typography.caption, { color: theme.textSecondary }]}>
                {sport.sessions} {sport.sessions > 1 ? 'séances' : 'séance'} ·{' '}
                {format.duration(sport.totalDurationS)}
              </Text>
            </View>
            <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>
              {sport.totals.distanceM != null
                ? `${format.distance(sport.totals.distanceM)} ${format.distanceUnit}`
                : '—'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Les quatre totaux. Séances et durée existent toujours — ce sont les seules
 * grandeurs que le socle connaisse. Distance et dénivelé n'apparaissent que si un
 * plugin les a déclarées sur la période.
 */
function Totals({ data }: { data: StatsSummary }) {
  const format = useFormat();
  const distance = data.totals.distanceM;
  const elevation = data.totals.elevationGainM;

  return (
    <View style={styles.grid}>
      {distance != null && (
        <StatCard
          style={styles.gridCell}
          label="Distance"
          value={format.distance(distance)}
          unit={format.distanceUnit}
          delta={formatDelta(deltaPercent(distance, data.previous.totals.distanceM ?? 0))}
        />
      )}
      <StatCard
        style={styles.gridCell}
        label="Séances"
        value={String(data.totalSessions)}
        delta={formatCountDelta(data.totalSessions, data.previous.sessions)}
      />
      <StatCard
        style={styles.gridCell}
        label="Temps actif"
        value={format.duration(data.totalDurationS)}
        delta={formatDelta(deltaPercent(data.totalDurationS, data.previous.durationS))}
      />
      {elevation != null && (
        <StatCard
          style={styles.gridCell}
          label="Dénivelé +"
          value={String(Math.round(elevation))}
          unit="m"
        />
      )}
    </View>
  );
}

/**
 * Pour un compte de séances, l'écart brut parle mieux qu'un pourcentage : « + 3 »
 * se comprend d'un coup d'œil là où « + 14 % » demande de connaître le total
 * précédent. Rien à afficher quand la période précédente était vide.
 */
export function formatCountDelta(current: number, previous: number): string | null {
  if (previous <= 0) {
    return null;
  }
  const diff = current - previous;
  if (diff === 0) {
    return '=';
  }
  return diff > 0 ? `+ ${diff}` : `− ${Math.abs(diff)}`;
}

function cardSkin(theme: ReturnType<typeof useTheme>) {
  return { backgroundColor: theme.surfaceCard, borderColor: theme.borderSubtle };
}

const styles = StyleSheet.create({
  container: { padding: spacing.layoutGutter, gap: spacing.md, paddingBottom: spacing.xxl },
  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  filters: { gap: spacing.xs },
  body: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  // Deux colonnes : (100 % − gouttière) / 2, exprimé en flex-basis pour rester
  // juste quel que soit la largeur de l'appareil.
  gridCell: { flexGrow: 1, flexBasis: '46%' },
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  cardCaption: { marginBottom: spacing.sm },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  sportLhs: { gap: 2 },
});
