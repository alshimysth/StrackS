/** Screens of the climbing family: the timer with the climb log, and the summary. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TimerTrackingScreen } from '../../core/session/TimerTrackingScreen';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import type { Activity } from '../../types/api';
import type { SportScreens } from '../types';
import { boulderingEntry, parseClimbingMetrics, ropeClimbingEntry, type ClimbingCatalogEntry } from './catalog';
import { ClimbingPanel } from './ClimbingPanel';
import { climbingMetricsFromDraft, initialClimbingDraft, type ClimbingDraft } from './draft';

function createClimbingScreens(entry: ClimbingCatalogEntry): SportScreens {
  function TrackingScreen() {
    return (
      <TimerTrackingScreen<ClimbingDraft>
        sportCode={entry.code}
        appearance={entry.appearance}
        initialDraft={() => initialClimbingDraft(entry.code)}
        panel={(draft, onChange) => (
          <ClimbingPanel discipline={entry.code} draft={draft} onChange={onChange} />
        )}
        metricsFromDraft={climbingMetricsFromDraft}
      />
    );
  }

  function SummaryPanel({ activity }: { activity: Activity }) {
    const theme = useTheme();
    const metrics = parseClimbingMetrics(activity);
    return (
      <View style={styles.rows}>
        <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>
          {metrics.climbsCount ?? 0} {entry.noun} · {metrics.sendsCount ?? 0} réussis
          {metrics.location != null ? (metrics.location === 'indoor' ? ' · en salle' : ' · en extérieur') : ''}
        </Text>
        {metrics.hardestSentGrade != null && (
          <Text style={[typography.body, { color: theme.textSecondary }]}>
            Plus dur réussi : {metrics.hardestSentGrade}
          </Text>
        )}
        {metrics.climbs != null && metrics.climbs.length > 0 && (
          <Text style={[typography.caption, { color: theme.textSecondary }]}>
            {metrics.climbs.map((c) => c.grade).join(' · ')}
          </Text>
        )}
      </View>
    );
  }

  return { TrackingScreen, SummaryPanel };
}

export const climbingScreens: Record<string, SportScreens> = {
  [boulderingEntry.code]: createClimbingScreens(boulderingEntry),
  [ropeClimbingEntry.code]: createClimbingScreens(ropeClimbingEntry),
};

const styles = StyleSheet.create({
  rows: { gap: spacing.xs },
});
