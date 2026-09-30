/**
 * "All time" profile statistics (#7). Aggregated by the server
 * (`/stats/summary?period=all`): the profile never pulls the history to add it up. The
 * distance only appears if a practised sport declares one; the core doesn't know that a
 * sport "has" a distance.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAllTimeSummary } from '../api/use-stats';
import { formatLongDuration } from '../format/units';
import { useFormat } from '../format/use-format';
import { ErrorState } from '../../design-system/components/ErrorState';
import { LoadingState } from '../../design-system/components/LoadingState';
import { StatCard } from '../../design-system/components/StatCard';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export function AllTimeStats() {
  const theme = useTheme();
  const format = useFormat();
  const summary = useAllTimeSummary();

  let body: React.ReactNode;
  if (summary.isPending) {
    body = <LoadingState message="Calcul de tes totaux" />;
  } else if (summary.isError) {
    body = <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  } else if (summary.data.totalSessions === 0) {
    body = (
      <Text testID="all-time-empty" style={[typography.body, { color: theme.textSecondary }]}>
        Tes totaux apparaîtront après ta première séance.
      </Text>
    );
  } else {
    const distanceM = summary.data.totals.distanceM;
    body = (
      <View style={styles.grid}>
        <StatCard
          testID="all-time-sessions"
          label="Séances"
          value={String(summary.data.totalSessions)}
          style={styles.cell}
        />
        <StatCard
          testID="all-time-duration"
          label="Temps total"
          value={formatLongDuration(summary.data.totalDurationS)}
          style={styles.cell}
        />
        {distanceM != null && distanceM > 0 && (
          <StatCard
            testID="all-time-distance"
            label="Distance totale"
            value={format.distance(distanceM)}
            unit={format.distanceUnit}
            style={styles.cell}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.section} testID="all-time-section">
      <Text style={[typography.h3, { color: theme.textPrimary }]}>Depuis le début</Text>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.base },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: { flexGrow: 1, flexBasis: '45%' },
});
