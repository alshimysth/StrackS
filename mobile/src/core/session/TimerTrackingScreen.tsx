/**
 * Live screen of a timed sport (bouldering, tennis, treadmill…): the sibling of
 * `SessionTrackingScreen` for sports without a track.
 *
 * Generic on purpose: the engine shows the timer and the controls; the sport module
 * provides the **panel** that edits the session draft (routes, sets, machine readings)
 * and the function that turns the draft into the metrics sent at stop. No module copies
 * the pause/finish logic (Epic 4 DoD, extended to timed sports).
 *
 * Not forced to the dark theme: these sports are mostly played indoors, where the "full
 * sun" contrast of the GPS screen isn't needed.
 */
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionStore } from './use-session-store';
import { useFormat } from '../format/use-format';
import { Button } from '../../design-system/components/Button';
import { HoldToFinish } from '../../design-system/components/HoldToFinish';
import { SportBadge, type SportAppearance } from '../../design-system/components/SportBadge';
import { StatCard } from '../../design-system/components/StatCard';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

interface Props<Draft> {
  sportCode: string;
  appearance?: SportAppearance;
  /** The sport's live panel, editing the draft through `onChange`. */
  panel: (draft: Draft, onChange: (next: Draft) => void) => React.ReactNode;
  /** The report sent at stop, built from the draft. */
  metricsFromDraft: (draft: Draft) => Record<string, unknown>;
  /** What the engine starts with when no draft has been recovered. */
  initialDraft: () => Draft;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur inattendue.';
}

export function TimerTrackingScreen<Draft>({
  sportCode,
  appearance,
  panel,
  metricsFromDraft,
  initialDraft,
}: Props<Draft>) {
  useKeepAwake();
  const theme = useTheme();
  const router = useRouter();
  const format = useFormat();
  const status = useSessionStore((s) => s.status);
  const live = useSessionStore((s) => s.live);
  const storedDraft = useSessionStore((s) => s.draft);
  const [finishing, setFinishing] = React.useState(false);

  // The draft lives in the engine (persisted, recovered after a kill); the screen only
  // reads it. A missing one (recovered session written by an older version) starts fresh.
  const draft = (storedDraft ?? initialDraft()) as Draft;
  const onChange = (next: Draft) => {
    void useSessionStore.getState().setDraft(next);
  };

  const onTogglePause = async () => {
    try {
      if (status === 'active') {
        await useSessionStore.getState().pause();
      } else if (status === 'paused') {
        await useSessionStore.getState().resume();
      }
    } catch (error) {
      Alert.alert('Reprise impossible', errorMessage(error));
    }
  };

  const onFinish = async () => {
    if (finishing) {
      return;
    }
    setFinishing(true);
    try {
      const activity = await useSessionStore.getState().stop({ metrics: metricsFromDraft(draft) });
      router.replace(`/summary/${activity.id}`);
    } catch (error) {
      Alert.alert('Séance non terminée', errorMessage(error));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surfaceApp }]} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <SportBadge sport={sportCode} appearance={appearance} variant="outline" />
          <Text style={[typography.label, { color: status === 'paused' ? theme.textWarning : theme.textSuccess }]}>
            {status === 'paused' ? 'EN PAUSE' : 'EN COURS'}
          </Text>
        </View>

        <StatCard label="Durée" value={format.duration(live.elapsedS)} emphasis="xl" testID="timer-elapsed" />

        <ScrollView
          style={styles.panel}
          contentContainerStyle={styles.panelContent}
          keyboardShouldPersistTaps="handled"
          testID="timer-panel"
        >
          {panel(draft, onChange)}
        </ScrollView>

        <View style={styles.controls}>
          <Button
            size="lg"
            icon={status === 'active' ? 'action-pause' : 'action-resume'}
            onPress={() => void onTogglePause()}
            disabled={status === 'stopping'}
            style={styles.pauseButton}
          >
            {status === 'active' ? 'Pause' : 'Reprendre'}
          </Button>
          <HoldToFinish onFinish={() => void onFinish()} disabled={finishing} />
        </View>
        <Text style={[typography.caption, styles.hint, { color: theme.textSecondary }]}>
          Maintiens le bouton 1,5 s pour terminer la séance
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  screen: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.layoutGutter,
    paddingTop: spacing.layoutGutter,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panel: { flex: 1 },
  panelContent: { gap: spacing.md, paddingBottom: spacing.md },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: 'auto',
  },
  pauseButton: { flex: 1 },
  hint: { textAlign: 'center' },
});
