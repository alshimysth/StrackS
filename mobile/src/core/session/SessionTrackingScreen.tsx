/**
 * Écran de tracking live — transposition RN de screens/tracking-running.html
 * (Claude Design) : en-tête sport + état GPS, carte, métrique héro, grille
 * 2×2, contrôles Pause + hold-to-finish. Thème sombre forcé (« plein soleil »).
 * Générique : chaque module de sport fournit héro et grille depuis
 * SessionState — zéro copier-coller du moteur entre sports (DoD Epic 4).
 */
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_ACCURACY_M } from './metrics';
import { useSessionStore } from './use-session-store';
import type { LiveMetric, SessionState } from './types';
import { Button } from '../../design-system/components/Button';
import { HoldToFinish } from '../../design-system/components/HoldToFinish';
import { SportBadge } from '../../design-system/components/SportBadge';
import { StatCard } from '../../design-system/components/StatCard';
import { darkTheme, radius, spacing, typography } from '../../design-system/theme';
import { ThemeOverride } from '../../design-system/use-theme';
import { LiveMap } from '../map/LiveMap';

interface Props {
  sportCode: string;
  hero: (session: SessionState) => LiveMetric;
  grid: (session: SessionState) => LiveMetric[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur inattendue.';
}

export function SessionTrackingScreen({ sportCode, hero, grid }: Props) {
  useKeepAwake();
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const live = useSessionStore((s) => s.live);
  const gpsAccuracyM = useSessionStore((s) => s.gpsAccuracyM);
  const signalLost = useSessionStore((s) => s.signalLost);
  const [finishing, setFinishing] = React.useState(false);

  const heroMetric = hero(live);
  const gridMetrics = grid(live);

  // Le signal perdu prime sur la précision : un dernier fix parfait n'a plus de sens
  // s'il date de trente secondes.
  const gpsColor = signalLost
    ? darkTheme.textError
    : gpsAccuracyM == null
      ? darkTheme.textWarning
      : gpsAccuracyM <= 25
        ? darkTheme.textSuccess
        : gpsAccuracyM <= MAX_ACCURACY_M
          ? darkTheme.textWarning
          : darkTheme.textError;

  const onTogglePause = async () => {
    try {
      if (status === 'active') {
        await useSessionStore.getState().pause();
      } else if (status === 'paused') {
        await useSessionStore.getState().resume();
      }
    } catch (error) {
      Alert.alert('GPS indisponible', errorMessage(error));
    }
  };

  const onFinish = async () => {
    if (finishing) {
      return;
    }
    setFinishing(true);
    try {
      const activity = await useSessionStore.getState().stop();
      router.replace(`/summary/${activity.id}`);
    } catch (error) {
      Alert.alert('Séance non terminée', errorMessage(error));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <ThemeOverride theme={darkTheme}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <View style={styles.header}>
            <SportBadge sport={sportCode} variant="outline" />
            <View style={styles.gps}>
              <View style={[styles.gpsDot, { backgroundColor: gpsColor }]} />
              <Text style={[typography.label, { color: gpsColor }]}>
                {signalLost ? 'GPS PERDU' : 'GPS'}
              </Text>
            </View>
          </View>

          {/* Explicite le silence : sans ça, l'utilisateur voit une distance qui
              stagne sans comprendre pourquoi, et croit l'app plantée. Dire que la
              distance n'est pas comptée est la moitié utile du message. */}
          {signalLost && (
            <View testID="gps-lost-banner" style={[styles.lostBanner, { borderColor: darkTheme.textError }]}>
              <Text style={[typography.label, { color: darkTheme.textError }]}>SIGNAL GPS PERDU</Text>
              <Text style={[typography.caption, { color: darkTheme.textSecondary }]}>
                La séance continue. La distance reprendra au retour du signal — le trajet
                parcouru sans signal n'est pas compté.
              </Text>
            </View>
          )}

          <View style={styles.map}>
            <LiveMap />
          </View>

          <StatCard
            label={heroMetric.label}
            value={heroMetric.value}
            unit={heroMetric.unit}
            emphasis="xl"
          />

          <View style={styles.grid}>
            {gridMetrics.map((metric) => (
              <StatCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                unit={metric.unit}
                style={styles.gridCell}
              />
            ))}
          </View>

          <View style={styles.controls}>
            <Button
              size="lg"
              onPress={() => void onTogglePause()}
              disabled={status === 'stopping'}
              style={styles.pauseButton}
            >
              {status === 'active' ? 'Pause' : 'Reprendre'}
            </Button>
            <HoldToFinish onFinish={() => void onFinish()} disabled={finishing} />
          </View>
          <Text style={[typography.caption, styles.hint]}>
            Maintiens le bouton 1,5 s pour terminer la séance
          </Text>
        </View>
      </SafeAreaView>
    </ThemeOverride>
  );
}

const styles = StyleSheet.create({
  lostBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  safe: { flex: 1, backgroundColor: darkTheme.surfaceApp },
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
  gps: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  map: {
    flex: 1,
    minHeight: 200,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkTheme.borderSubtle,
    overflow: 'hidden',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridCell: { flexGrow: 1, flexBasis: '45%' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: 'auto',
  },
  pauseButton: { flex: 1 },
  hint: { color: darkTheme.textTertiary, textAlign: 'center' },
});
