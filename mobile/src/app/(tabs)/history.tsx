/** Historique — liste paginée (Epic 5 : filtres, détail, édition). */
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { api } from '../../core/api/client';
import { SportBadge } from '../../design-system/components/SportBadge';
import { radius, shadows, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import { formatDuration } from '../../sports/running/format';
import type { Activity, Page } from '../../types/api';

export default function HistoryScreen() {
  const theme = useTheme();
  const history = useQuery({
    queryKey: ['activities'],
    queryFn: () => api<Page<Activity>>('/api/v1/activities?page=0&size=20'),
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceApp }]}>
      <Text style={[typography.h2, { color: theme.textPrimary }]}>Historique</Text>
      {history.isLoading && <ActivityIndicator style={{ marginTop: spacing.xl }} />}
      {history.data?.items.length === 0 && (
        <Text style={[typography.bodyLg, { color: theme.textSecondary, marginTop: spacing.lg }]}>
          Aucune séance pour l'instant. Démarre ta première depuis l'accueil !
        </Text>
      )}
      <FlatList
        data={history.data?.items ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.lg }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              shadows.card,
              { backgroundColor: theme.surfaceCard, borderColor: theme.borderSubtle },
            ]}
          >
            <SportBadge sport={item.sportType} size="sm" />
            <Text style={[typography.h3, { color: theme.textPrimary }]}>
              {item.distanceM != null ? `${(item.distanceM / 1000).toFixed(2)} km` : '—'}
              {item.durationS != null ? `  ·  ${formatDuration(item.durationS)}` : ''}
            </Text>
            <Text style={[typography.caption, { color: theme.textTertiary }]}>
              {new Date(item.startedAt).toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.layoutGutter },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
