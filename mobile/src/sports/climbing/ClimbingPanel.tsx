/**
 * Live panel of a climbing session: a grade picker, a result, an "add" button, and the
 * log of what's been climbed. One tap per climb between two attempts: a climber logs with
 * chalky hands, the controls are big and few.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../design-system/components/Button';
import { FilterChips } from '../../design-system/components/FilterChips';
import { Icon } from '../../design-system/components/Icon';
import { radius, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import {
  RESULTS,
  addClimb,
  climbingTotals,
  isSend,
  removeClimb,
  setLocation,
  type ClimbResult,
  type ClimbingDraft,
} from './draft';
import { gradeScale, type Discipline } from './grades';

interface Props {
  discipline: Discipline;
  draft: ClimbingDraft;
  onChange: (next: ClimbingDraft) => void;
}

export function ClimbingPanel({ discipline, draft, onChange }: Props) {
  const theme = useTheme();
  const scale = React.useMemo(() => gradeScale(discipline), [discipline]);
  const [result, setResult] = React.useState<ClimbResult>(RESULTS[discipline][0].value);
  const [attempts, setAttempts] = React.useState(1);
  const totals = climbingTotals(draft, discipline);
  const resultOptions = RESULTS[discipline].map((r) => ({ value: r.value, label: r.label }));
  const noun = discipline === 'bouldering' ? 'blocs' : 'voies';

  const add = () => {
    onChange(addClimb(draft, { grade: draft.nextGrade, result, attempts }));
    setAttempts(1);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.totals} testID="climbing-totals">
        <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>
          {totals.climbs} {noun} · {totals.sends} réussis
        </Text>
        {totals.hardest != null && (
          <Text style={[typography.body, { color: theme.textSecondary }]}>
            Plus dur réussi : {totals.hardest}
          </Text>
        )}
      </View>

      <FilterChips
        options={[
          { value: 'indoor', label: 'En salle' },
          { value: 'outdoor', label: 'En extérieur' },
        ]}
        value={draft.location}
        onChange={(location) => onChange(setLocation(draft, location))}
        accessibilityLabel="Lieu"
      />

      <Text style={[typography.label, { color: theme.textSecondary }]}>COTATION</Text>
      <FilterChips
        options={scale.map((grade) => ({ value: grade, label: grade }))}
        value={draft.nextGrade}
        onChange={(grade) => onChange({ ...draft, nextGrade: grade })}
        accessibilityLabel="Cotation"
      />

      <Text style={[typography.label, { color: theme.textSecondary }]}>RÉSULTAT</Text>
      <FilterChips options={resultOptions} value={result} onChange={setResult} accessibilityLabel="Résultat" />

      <View style={styles.attemptsRow}>
        <Text style={[typography.body, { color: theme.textSecondary }]}>Essais</Text>
        <Pressable
          testID="attempts-minus"
          accessibilityRole="button"
          accessibilityLabel="Un essai de moins"
          onPress={() => setAttempts((n) => Math.max(1, n - 1))}
          hitSlop={8}
        >
          <Icon name="action-remove" color={theme.textPrimary} />
        </Pressable>
        <Text testID="attempts-value" style={[typography.bodyLg, { color: theme.textPrimary }]}>
          {attempts}
        </Text>
        <Pressable
          testID="attempts-plus"
          accessibilityRole="button"
          accessibilityLabel="Un essai de plus"
          onPress={() => setAttempts((n) => Math.min(100, n + 1))}
          hitSlop={8}
        >
          <Icon name="action-add" color={theme.textPrimary} />
        </Pressable>
      </View>

      <Button icon="action-add" onPress={add} fullWidth>
        {`Ajouter ${draft.nextGrade}`}
      </Button>

      {draft.climbs.length > 0 && (
        <View style={styles.log} testID="climb-log">
          {draft.climbs.map((climb, index) => (
            <View
              key={`${index}-${climb.grade}`}
              style={[styles.logRow, { backgroundColor: theme.surfaceCard, borderColor: theme.borderSubtle }]}
            >
              <Text style={[typography.bodyLg, { color: isSend(climb.result) ? theme.textSuccess : theme.textPrimary }]}>
                {climb.grade}
              </Text>
              <Text style={[typography.body, styles.logResult, { color: theme.textSecondary }]}>
                {RESULTS[discipline].find((r) => r.value === climb.result)?.label}
                {climb.attempts > 1 ? ` · ${climb.attempts} essais` : ''}
              </Text>
              <Pressable
                testID={`climb-remove-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Retirer ${climb.grade}`}
                onPress={() => onChange(removeClimb(draft, index))}
                hitSlop={8}
              >
                <Icon name="action-delete" color={theme.textSecondary} size="md" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  totals: { gap: 2 },
  attemptsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  log: { gap: spacing.sm },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  logResult: { flex: 1 },
});
