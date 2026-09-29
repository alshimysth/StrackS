/**
 * Home: starting a session. The list of sports comes from the BACKEND (GET /sport-types)
 * matched against the local registry: never a hard-coded list. The Démarrer button opens
 * the tracking route, which runs the countdown then starts the session.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSportTypes } from '../../core/api/use-sport-types';
import { usePreferences } from '../../core/preferences/use-preferences';
import { initialSelection, orderSports } from '../../core/preferences/sport-order';
import { distanceProgress, hasGoal, sessionsProgress } from '../../core/preferences/weekly-goal';
import { useStatsSummary } from '../../core/api/use-stats';
import { useFormat } from '../../core/format/use-format';
import { GoalProgressCard } from '../../design-system/components/GoalProgressCard';
import { useAuthStore } from '../../core/auth/use-auth-store';
import { useSessionStore } from '../../core/session/use-session-store';
import { Button } from '../../design-system/components/Button';
import { Icon } from '../../design-system/components/Icon';
import { ErrorState } from '../../design-system/components/ErrorState';
import { LoadingState } from '../../design-system/components/LoadingState';
import { SportBadge } from '../../design-system/components/SportBadge';
import { colors, radius, shadows, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import { sportRegistry } from '../../sports/registry';
import { SafeScreen } from '../../design-system/components/SafeScreen';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const sportTypes = useSportTypes();
  const sessionStatus = useSessionStore((s) => s.status);
  const preferences = usePreferences();
  const defaultSport = preferences.data?.defaultSport ?? null;

  /**
   * Server order, preferred sport moved to the top (#34).
   *
   * Filtered on the registry FIRST: a sport exposed by the backend without a mobile
   * module can't be started. Letting it through would allow preselecting it, showing
   * "Démarrer", then doing nothing on tap: a dead end.
   */
  const sports = React.useMemo(
    () => orderSports((sportTypes.data ?? []).filter((s) => sportRegistry[s.code] != null), defaultSport),
    [sportTypes.data, defaultSport],
  );

  const [selected, setSelected] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState(false);

  // Preselection as soon as sports and preferences are known, but never after an explicit
  // choice: reapplying the default would erase the user's selection on the slightest list
  // refresh.
  React.useEffect(() => {
    if (!touched) {
      setSelected(initialSelection(sports, defaultSport));
    }
  }, [sports, defaultSport, touched]);

  const choose = (code: string) => {
    setTouched(true);
    setSelected(code);
  };

  /**
   * The actual start happens in /tracking, not here (#3).
   *
   * The countdown must elapse BEFORE `start()`; otherwise the first three seconds of track
   * would be recorded while the user is still putting their phone away. And it must show
   * before any permission request, or else a system popup during the countdown makes the
   * app look frozen.
   *
   * This screen therefore only navigates: `start()` is called by the tracking screen at
   * the end of the countdown.
   */
  const handleStart = () => {
    const module = selected != null ? sportRegistry[selected] : undefined;
    if (module == null) {
      return;
    }
    router.push({ pathname: '/tracking', params: { sport: module.code } });
  };

  return (
    <SafeScreen edges={['top']}>
      <ScrollView
        style={{ backgroundColor: theme.surfaceApp }}
        contentContainerStyle={styles.container}
      >
        <Text style={[typography.h2, { color: theme.textPrimary }]}>
          Salut {user?.displayName ?? 'toi'} !
        </Text>
        <Text style={[typography.bodyLg, { color: theme.textSecondary }]}>
          Choisis ton sport et démarre.
        </Text>

        <WeeklyGoal />

        {sportTypes.isLoading && <LoadingState message="Récupération des sports" />}
        {sportTypes.isError && (
          <ErrorState error={sportTypes.error} onRetry={() => void sportTypes.refetch()} />
        )}

        <View style={styles.sportList}>
          {sports.map((sport) => {
            const isSelected = selected === sport.code;
            return (
              <Pressable
                key={sport.code}
                onPress={() => choose(sport.code)}
                // Exclusive choice: a screen reader announces "radio button, selected"
                // rather than a mute card whose border alone changes (#42).
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={sport.label}
                style={[
                  styles.sportCard,
                  shadows.card,
                  {
                    backgroundColor: theme.surfaceCard,
                    borderColor: isSelected ? colors.primary500 : theme.borderSubtle,
                  },
                ]}
                testID={`sport-${sport.code}`}
              >
                <View style={styles.sportHeader}>
                  {sportRegistry[sport.code]?.icon != null && (
                    <Icon
                      name={sportRegistry[sport.code]?.icon ?? 'state-empty'}
                      color={isSelected ? colors.primary500 : theme.textSecondary}
                    />
                  )}
                  <SportBadge sport={sport.code} />
                </View>
                <Text style={[typography.h3, { color: theme.textPrimary }]}>{sport.label}</Text>
                <Text style={[typography.caption, { color: theme.textSecondary }]}>
                  {sport.usesGps ? 'GPS · carte · allure' : 'Saisie manuelle'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {selected != null && (
          <Button
            size="lg"
            fullWidth
            disabled={sessionStatus !== 'idle'}
            onPress={() => void handleStart()}
            style={{ marginTop: spacing.lg }}
          >
            {sessionStatus === 'starting' ? 'Démarrage…' : 'Démarrer la séance'}
          </Button>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

/**
 * Weekly progress on the home screen (#35).
 *
 * Silent by default: without a goal set, this component renders nothing, since the DoD
 * forbids any "stray UI". It doesn't report its errors either: a home screen showing an
 * error banner for a secondary indicator does more harm than the indicator's absence.
 */
function WeeklyGoal() {
  const format = useFormat();
  const preferences = usePreferences();
  const goal = preferences.data?.weeklyGoal;
  const stats = useStatsSummary({ period: 'week', sport: undefined });

  if (goal == null || !hasGoal(goal) || stats.data == null) {
    return null;
  }

  const totals = {
    distanceM: stats.data.totals.distanceM ?? 0,
    sessions: stats.data.totalSessions,
  };
  const distance = distanceProgress(totals, goal);
  const sessions = sessionsProgress(totals, goal);

  return (
    <View style={styles.goals} testID="weekly-goals">
      {distance != null && (
        <GoalProgressCard
          testID="goal-distance"
          label="Objectif distance — cette semaine"
          valueLabel={`${format.distance(distance.current)} / ${format.distance(distance.target)} ${format.distanceUnit}`}
          progress={distance}
        />
      )}
      {sessions != null && (
        <GoalProgressCard
          testID="goal-sessions"
          label="Objectif séances — cette semaine"
          valueLabel={`${sessions.current} / ${sessions.target}`}
          progress={sessions}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  goals: { gap: spacing.md, marginTop: spacing.base },
  container: { padding: spacing.layoutGutter, gap: spacing.sm },
  sportList: { gap: spacing.md, marginTop: spacing.lg },
  sportHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sportCard: {
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
