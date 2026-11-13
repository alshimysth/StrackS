/** Screens of the racket family: the timer with the score, and the summary. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TimerTrackingScreen } from '../../core/session/TimerTrackingScreen';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import type { Activity } from '../../types/api';
import type { SportScreens } from '../types';
import { parseRacketMetrics, racketEntries, scoreLine, type RacketCatalogEntry } from './catalog';
import { RacketPanel } from './RacketPanel';
import { RESULT_LABELS, initialRacketDraft, racketMetricsFromDraft, type RacketDraft } from './score';

function createRacketScreens(entry: RacketCatalogEntry): SportScreens {
  function TrackingScreen() {
    return (
      <TimerTrackingScreen<RacketDraft>
        sportCode={entry.code}
        appearance={entry.appearance}
        initialDraft={() => initialRacketDraft(entry.defaultFormat)}
        panel={(draft, onChange) => (
          <RacketPanel rules={entry.rules} draft={draft} onChange={onChange} scoreNoun={entry.scoreNoun} />
        )}
        metricsFromDraft={racketMetricsFromDraft}
      />
    );
  }

  function SummaryPanel({ activity }: { activity: Activity }) {
    const theme = useTheme();
    const metrics = parseRacketMetrics(activity);
    const score = scoreLine(metrics);
    return (
      <View style={styles.rows}>
        <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>
          {metrics.result != null
            ? `${RESULT_LABELS[metrics.result]} · ${metrics.setsWon ?? 0}–${metrics.setsLost ?? 0} en sets`
            : 'Score non enregistré'}
          {metrics.format != null ? (metrics.format === 'doubles' ? ' · double' : ' · simple') : ''}
        </Text>
        {score != null && <Text style={[typography.body, { color: theme.textSecondary }]}>{score}</Text>}
      </View>
    );
  }

  return { TrackingScreen, SummaryPanel };
}

export const racketScreens: Record<string, SportScreens> = Object.fromEntries(
  racketEntries.map((entry) => [entry.code, createRacketScreens(entry)]),
);

const styles = StyleSheet.create({
  rows: { gap: spacing.xs },
});
