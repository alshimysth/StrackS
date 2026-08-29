/**
 * Accueil — démarrage de séance. La liste des sports vient du BACKEND
 * (GET /sport-types) croisée avec le registre local : jamais de liste en dur.
 * Le bouton Démarrer ouvrira l'écran de tracking du module (Epic 3/4).
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
import { ErrorState } from '../../design-system/components/ErrorState';
import { LoadingState } from '../../design-system/components/LoadingState';
import { SportBadge } from '../../design-system/components/SportBadge';
import { radius, shadows, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import { sportRegistry } from '../../sports/registry';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const sportTypes = useSportTypes();
  const sessionStatus = useSessionStore((s) => s.status);
  const preferences = usePreferences();
  const defaultSport = preferences.data?.defaultSport ?? null;

  /**
   * Ordre serveur, sport préféré remonté en tête (#34).
   *
   * Filtré sur le registre AVANT tout : un sport exposé par le backend sans module
   * mobile n'est pas démarrable. Le laisser passer permettrait de le présélectionner,
   * d'afficher « Démarrer », puis de ne rien faire au clic — un cul-de-sac.
   */
  const sports = React.useMemo(
    () => orderSports((sportTypes.data ?? []).filter((s) => sportRegistry[s.code] != null), defaultSport),
    [sportTypes.data, defaultSport],
  );

  const [selected, setSelected] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState(false);

  // Présélection dès que sports et préférences sont connus — mais jamais après un
  // choix explicite : réappliquer le défaut effacerait la sélection de l'utilisateur
  // au moindre rafraîchissement de la liste.
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
   * Le démarrage effectif a lieu dans /tracking, pas ici (#3).
   *
   * Le compte à rebours doit s'écouler AVANT `start()` — sinon les trois premières
   * secondes de tracé seraient enregistrées pendant que l'utilisateur range encore son
   * téléphone. Et il doit s'afficher avant toute demande de permission, faute de quoi une
   * popup système pendant le décompte donne l'impression que l'app est figée.
   *
   * Cet écran ne fait donc plus que naviguer : `start()` est appelé par l'écran de
   * tracking à la fin du décompte.
   */
  const handleStart = () => {
    const module = selected != null ? sportRegistry[selected] : undefined;
    if (module == null) {
      return;
    }
    router.push({ pathname: '/tracking', params: { sport: module.code } });
  };

  return (
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
              style={[
                styles.sportCard,
                shadows.card,
                {
                  backgroundColor: theme.surfaceCard,
                  borderColor: isSelected ? '#3d78e6' : theme.borderSubtle,
                },
              ]}
              testID={`sport-${sport.code}`}
            >
              <SportBadge sport={sport.code} />
              <Text style={[typography.h3, { color: theme.textPrimary }]}>{sport.label}</Text>
              <Text style={[typography.caption, { color: theme.textTertiary }]}>
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
  );
}

/**
 * Progression hebdomadaire sur l'accueil (#35).
 *
 * Silencieux par défaut : sans objectif défini, ce composant ne rend rien — la DoD
 * interdit toute « UI parasite ». Il ne signale pas non plus ses erreurs : un accueil
 * qui affiche un bandeau d'erreur pour un indicateur secondaire fait plus de mal que
 * l'absence de l'indicateur.
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
  sportCard: {
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
