/**
 * Accueil — démarrage de séance. La liste des sports vient du BACKEND
 * (GET /sport-types) croisée avec le registre local : jamais de liste en dur.
 * Le bouton Démarrer ouvrira l'écran de tracking du module (Epic 3/4).
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSportTypes } from '../../core/api/use-sport-types';
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
  const [selected, setSelected] = React.useState<string | null>(null);

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

      {sportTypes.isLoading && <LoadingState message="Récupération des sports" />}
      {sportTypes.isError && (
        <ErrorState error={sportTypes.error} onRetry={() => void sportTypes.refetch()} />
      )}

      <View style={styles.sportList}>
        {sportTypes.data?.map((sport) => {
          const module = sportRegistry[sport.code];
          if (!module) {
            return null; // sport backend sans module mobile : ignoré
          }
          const isSelected = selected === sport.code;
          return (
            <Pressable
              key={sport.code}
              onPress={() => setSelected(sport.code)}
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

const styles = StyleSheet.create({
  container: { padding: spacing.layoutGutter, gap: spacing.sm },
  sportList: { gap: spacing.md, marginTop: spacing.lg },
  sportCard: {
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
