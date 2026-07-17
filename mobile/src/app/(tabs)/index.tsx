/**
 * Accueil — démarrage de séance. La liste des sports vient du BACKEND
 * (GET /sport-types) croisée avec le registre local : jamais de liste en dur.
 * Le bouton Démarrer ouvrira l'écran de tracking du module (Epic 3/4).
 */
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSportTypes } from '../../core/api/use-sport-types';
import { useAuthStore } from '../../core/auth/use-auth-store';
import { SportBadge } from '../../design-system/components/SportBadge';
import { radius, shadows, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import { sportRegistry } from '../../sports/registry';

export default function HomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const sportTypes = useSportTypes();
  const [selected, setSelected] = React.useState<string | null>(null);

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

      {sportTypes.isLoading && <ActivityIndicator style={{ marginTop: spacing.xl }} />}
      {sportTypes.isError && (
        <Text style={[typography.body, { color: theme.textError, marginTop: spacing.xl }]}>
          Impossible de charger les sports. Le backend tourne ? (voir README)
        </Text>
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
        <View style={[styles.startHint, { backgroundColor: theme.surfaceSunken }]}>
          <Text style={[typography.body, { color: theme.textSecondary }]}>
            Écran de tracking {sportRegistry[selected]?.label} : Epic 3/4 (moteur de séance + GPS +
            carte). Le socle rendra sportRegistry['{selected}'].TrackingScreen.
          </Text>
        </View>
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
  startHint: {
    marginTop: spacing.lg,
    borderRadius: radius.md,
    padding: spacing.base,
  },
});
