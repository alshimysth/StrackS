/**
 * Live panel of a racket match: the format, one row per set with +/− on each side, and
 * the running result. Big tap targets: a score is updated between two points, racket in
 * hand.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../design-system/components/Button';
import { FilterChips } from '../../design-system/components/FilterChips';
import { Icon } from '../../design-system/components/Icon';
import { radius, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import {
  RESULT_LABELS,
  addSet,
  adjustSet,
  matchOutcome,
  removeSet,
  setFormat,
  type RacketDraft,
  type RacketRules,
  type SetScore,
} from './score';

interface Props {
  rules: RacketRules;
  draft: RacketDraft;
  onChange: (next: RacketDraft) => void;
  /** "jeux" for tennis, "points" elsewhere. */
  scoreNoun: string;
}

export function RacketPanel({ rules, draft, onChange, scoreNoun }: Props) {
  const theme = useTheme();
  const outcome = matchOutcome(draft.sets);

  const counter = (index: number, side: keyof SetScore) => (
    <View style={styles.counter}>
      <Pressable
        testID={`set-${index}-${side}-minus`}
        accessibilityRole="button"
        accessibilityLabel={`Set ${index + 1}, ${side === 'won' ? 'moi' : 'adversaire'}, moins un`}
        onPress={() => onChange(adjustSet(draft, index, side, -1, rules))}
        hitSlop={8}
      >
        <Icon name="action-remove" color={theme.textPrimary} />
      </Pressable>
      <Text testID={`set-${index}-${side}`} style={[typography.statLg, styles.score, { color: theme.textPrimary }]}>
        {draft.sets[index][side]}
      </Text>
      <Pressable
        testID={`set-${index}-${side}-plus`}
        accessibilityRole="button"
        accessibilityLabel={`Set ${index + 1}, ${side === 'won' ? 'moi' : 'adversaire'}, plus un`}
        onPress={() => onChange(adjustSet(draft, index, side, 1, rules))}
        hitSlop={8}
      >
        <Icon name="action-add" color={theme.textPrimary} />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.panel}>
      <FilterChips
        options={[
          { value: 'singles', label: 'Simple' },
          { value: 'doubles', label: 'Double' },
        ]}
        value={draft.format}
        onChange={(format) => onChange(setFormat(draft, format))}
        accessibilityLabel="Format du match"
      />

      <View style={styles.headerRow}>
        <Text style={[typography.label, styles.headerCell, { color: theme.textSecondary }]}>MOI</Text>
        <Text style={[typography.label, styles.headerCell, { color: theme.textSecondary }]}>ADVERSAIRE</Text>
      </View>

      {draft.sets.map((_, index) => (
        <View
          key={index}
          testID={`set-row-${index}`}
          style={[styles.setRow, { backgroundColor: theme.surfaceCard, borderColor: theme.borderSubtle }]}
        >
          <Text style={[typography.caption, styles.setLabel, { color: theme.textSecondary }]}>
            Set {index + 1}
          </Text>
          {counter(index, 'won')}
          {counter(index, 'lost')}
          <Pressable
            testID={`set-remove-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Retirer le set ${index + 1}`}
            onPress={() => onChange(removeSet(draft, index))}
            disabled={draft.sets.length <= 1}
            hitSlop={8}
          >
            <Icon
              name="action-delete"
              color={draft.sets.length <= 1 ? theme.borderSubtle : theme.textSecondary}
              size="md"
            />
          </Pressable>
        </View>
      ))}

      <Text style={[typography.caption, { color: theme.textSecondary }]}>
        Score en {scoreNoun}, jusqu’à {rules.maxSetScore}.
      </Text>

      <Button
        icon="action-add"
        variant="secondary"
        onPress={() => onChange(addSet(draft, rules))}
        disabled={draft.sets.length >= rules.maxSets}
        fullWidth
      >
        Ajouter un set
      </Button>

      <Text testID="match-outcome" style={[typography.bodyLg, { color: theme.textPrimary }]}>
        {outcome.result == null
          ? 'Score non commencé'
          : `${RESULT_LABELS[outcome.result]} · ${outcome.setsWon}–${outcome.setsLost} en sets`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  headerRow: { flexDirection: 'row', paddingLeft: 56, paddingRight: 36 },
  headerCell: { flex: 1, textAlign: 'center' },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  setLabel: { width: 44 },
  counter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  score: { minWidth: 36, textAlign: 'center' },
});
