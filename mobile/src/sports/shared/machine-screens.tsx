/**
 * Screens of a "machine" sport: a timer with one input per reading, and a summary built
 * from the server's derived metrics.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useFormat } from '../../core/format/use-format';
import { TimerTrackingScreen } from '../../core/session/TimerTrackingScreen';
import { Input } from '../../design-system/components/Input';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import type { Activity } from '../../types/api';
import type { SportScreens } from '../types';
import { SummaryRows } from './gps-screens';
import {
  hasReadings,
  machineMetricsFromDraft,
  type MachineCatalogEntry,
  type MachineDraft,
} from './machine-catalog';

export function createMachineScreens(entry: MachineCatalogEntry): SportScreens {
  function Panel({ draft, onChange }: { draft: MachineDraft; onChange: (next: MachineDraft) => void }) {
    const theme = useTheme();
    const format = useFormat();
    // The unit system is fixed by the first reading and kept for the whole session: the
    // labels, the later readings and the conversion at stop all follow it. Changing the
    // preference mid-session must not reinterpret "5" (km) as five miles.
    const units = hasReadings(draft) ? draft.units : format.units;
    return (
      <View style={styles.panel}>
        <Text style={[typography.caption, { color: theme.textSecondary }]}>
          Recopie les valeurs de la machine, pendant ou à la fin de la séance.
        </Text>
        {entry.fields.map((field) => (
          <Input
            key={field.key}
            testID={`reading-${field.key}`}
            label={`${field.label} (${field.displayUnit ? field.displayUnit(units) : field.unit})`}
            keyboardType="decimal-pad"
            value={draft.readings[field.key] ?? ''}
            onChangeText={(text) => onChange({ units, readings: { ...draft.readings, [field.key]: text } })}
          />
        ))}
      </View>
    );
  }

  function TrackingScreen() {
    return (
      <TimerTrackingScreen<MachineDraft>
        sportCode={entry.code}
        appearance={entry.appearance}
        initialDraft={() => ({ units: 'metric', readings: {} })}
        panel={(draft, onChange) => <Panel draft={draft} onChange={onChange} />}
        metricsFromDraft={(draft) => machineMetricsFromDraft(entry.fields, draft)}
      />
    );
  }

  function SummaryPanel({ activity }: { activity: Activity }) {
    const theme = useTheme();
    const format = useFormat();
    const parsed = entry.metricsSchema.safeParse(activity.metrics);
    const metrics = (parsed.success ? parsed.data : {}) as Record<string, unknown>;
    const rows = entry.summaryRows(metrics, activity, format);
    if (rows.length === 0) {
      return (
        <Text style={[typography.body, { color: theme.textSecondary }]}>
          Aucune valeur relevée sur la machine.
        </Text>
      );
    }
    return <SummaryRows rows={rows} textPrimary={theme.textPrimary} textSecondary={theme.textSecondary} />;
  }

  return { TrackingScreen, SummaryPanel };
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
});
