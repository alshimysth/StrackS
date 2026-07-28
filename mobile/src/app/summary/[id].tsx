/**
 * Résumé de fin de séance (version minimale Epic 3) : stats socle + panneau
 * spécifique du module de sport. L'écran designé complet (célébration volt,
 * carte du tracé, splits) arrive avec l'étape M4 du plan.
 */
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getActivity } from '../../core/api/activities';
import { Button } from '../../design-system/components/Button';
import { SportBadge } from '../../design-system/components/SportBadge';
import { StatCard } from '../../design-system/components/StatCard';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import { sportRegistry } from '../../sports/registry';
import { formatDuration, formatKm } from '../../sports/running/format';

export default function SummaryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const activityQuery = useQuery({
    queryKey: ['activity', id],
    queryFn: () => getActivity(id),
    enabled: id != null,
  });
  const activity = activityQuery.data;
  const module = activity != null ? sportRegistry[activity.sportType] : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surfaceApp }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[typography.h2, { color: theme.textPrimary }]}>Séance terminée</Text>

        {activityQuery.isLoading && <ActivityIndicator style={{ marginTop: spacing.xl }} />}
        {activityQuery.isError && (
          <Text style={[typography.body, { color: theme.textError, marginTop: spacing.xl }]}>
            Impossible de charger le résumé.
          </Text>
        )}

        {activity != null && (
          <>
            <SportBadge sport={activity.sportType} />
            <View style={styles.grid}>
              <StatCard
                label="Distance"
                value={activity.distanceM != null ? formatKm(Number(activity.distanceM)) : '—'}
                unit="km"
                style={styles.gridCell}
              />
              <StatCard
                label="Durée"
                value={activity.durationS != null ? formatDuration(activity.durationS) : '—'}
                style={styles.gridCell}
              />
            </View>
            {module != null && (
              <View style={[styles.panel, { backgroundColor: theme.surfaceSunken }]}>
                <module.SummaryPanel activity={activity} />
              </View>
            )}
          </>
        )}

        <Button size="lg" fullWidth onPress={() => router.replace('/(tabs)')}>
          Terminer
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.layoutGutter, gap: spacing.base },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridCell: { flexGrow: 1, flexBasis: '45%' },
  panel: { borderRadius: 10, padding: spacing.base },
});
