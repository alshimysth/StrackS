/**
 * Corps commun au résumé de fin de séance (#22) et au détail d'une activité (#6).
 *
 * #6 demandait d'arbitrer entre réutiliser `summary/[id].tsx` et dupliquer. Les deux
 * écrans montrent exactement la même chose — carte, métriques, splits, panneau du
 * module, notes ; ils ne diffèrent que par ce qui les entoure (titre d'écran,
 * célébration, boutons). Ce composant porte donc le fond, chaque écran son cadre.
 *
 * Le socle ne connaît aucun sport : les métriques propres à la discipline passent
 * exclusivement par `module.SummaryPanel`, jamais par un `if (sportType === …)`.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RouteMap } from '../map/RouteMap';
import { maskRoute } from '../map/privacy';
import { hasWeight } from '../preferences/schema';
import { usePreferences } from '../preferences/use-preferences';
import { SplitsList, parseSplits } from '../../design-system/components/SplitsList';
import { StatCard } from '../../design-system/components/StatCard';
import { radius, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';
import { sportRegistry } from '../../sports/registry';
import { useFormat } from '../format/use-format';
import type { Activity } from '../../types/api';
import { toPath, useTrackPoints } from '../api/use-activity';

interface Props {
  activity: Activity;
}

export function ActivityDetailBody({ activity }: Props) {
  const theme = useTheme();
  const format = useFormat();
  const module = sportRegistry[activity.sportType];
  const trackPoints = useTrackPoints(activity.id);
  const { preferences, data: loadedPreferences } = usePreferences();
  const path = React.useMemo(() => toPath(trackPoints.data ?? []), [trackPoints.data]);
  // #37 : masquage à l'affichage seulement — le tracé stocké et exporté reste complet.
  const route = React.useMemo(
    () => maskRoute(path, preferences.privacyZones),
    [path, preferences.privacyZones],
  );
  const splits = React.useMemo(
    () => parseSplits((activity.metrics as Record<string, unknown> | null)?.splits),
    [activity.metrics],
  );

  return (
    <>
      {/* Le tracé n'apparaît que s'il existe : une séance sans GPS (ou dont le tracé
          n'a pas encore été téléversé) ne doit pas laisser un cadre vide. */}
      {/* Pas de carte tant que les zones de confidentialité ne sont pas connues (revue
          PR #80) : pendant le chargement, ou en cas d'échec, `usePreferences` sert des
          défauts sans zone — le tracé complet s'afficherait, départ au domicile compris. */}
      {loadedPreferences != null && route.segments.length > 0 && (
        <View style={[styles.mapFrame, { borderColor: theme.borderSubtle }]}>
          <RouteMap segments={route.segments} />
        </View>
      )}
      {loadedPreferences == null && path.length > 0 && (
        <Text testID="map-pending" style={[typography.caption, { color: theme.textSecondary }]}>
          La carte s’affichera une fois tes réglages de confidentialité chargés.
        </Text>
      )}
      {/* Dit explicitement ce qui manque : un trou sans explication passerait pour une
          perte de signal, et « masqué » n'est pas « supprimé » (DoD #37). */}
      {loadedPreferences != null && route.hiddenPoints > 0 && (
        <Text testID="privacy-masked" style={[typography.caption, { color: theme.textSecondary }]}>
          {route.segments.length === 0
            ? 'Tout le tracé est dans une zone de confidentialité : il n’est pas affiché.'
            : 'Les portions dans tes zones de confidentialité sont masquées.'}{' '}
          Le tracé complet reste enregistré et figure dans ton export.
        </Text>
      )}

      <View style={styles.grid}>
        <StatCard
          label="Distance"
          value={activity.distanceM != null ? format.distance(Number(activity.distanceM)) : '—'}
          unit={format.distanceUnit}
          emphasis="xl"
          style={styles.gridCell}
        />
        <StatCard
          label="Durée"
          value={activity.durationS != null ? format.duration(activity.durationS) : '—'}
          emphasis="xl"
          style={styles.gridCell}
        />
        {activity.calories != null && (
          <StatCard
            label="Calories"
            value={String(activity.calories)}
            unit="kcal"
            style={styles.gridCell}
          />
        )}
        {/* #33 : sans poids, le serveur n'invente rien — l'écran dit pourquoi et comment
            y remédier, comme le prévoit la maquette (« — » + « Renseigne ton poids »). */}
        {activity.calories == null && !hasWeight(preferences) && (
          <View testID="calories-missing" style={styles.gridCell}>
            <StatCard label="Calories" value="—" style={styles.fill} />
            <Text style={[typography.caption, { color: theme.textSecondary }]}>
              Renseigne ton poids dans Profil pour estimer tes calories.
            </Text>
          </View>
        )}
      </View>

      {module != null && (
        <View style={[styles.panel, { backgroundColor: theme.surfaceSunken }]}>
          <module.SummaryPanel activity={activity} />
        </View>
      )}

      {splits.length > 0 && (
        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.textSecondary }]}>SPLITS AU KM</Text>
          <SplitsList splits={splits} sportCode={activity.sportType} />
        </View>
      )}

      {activity.notes != null && activity.notes.trim().length > 0 && (
        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.textSecondary }]}>NOTES</Text>
          <Text testID="activity-notes" style={[typography.body, { color: theme.textPrimary }]}>
            {activity.notes}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  mapFrame: {
    height: 220,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridCell: { flexGrow: 1, flexBasis: '45%' },
  fill: { flexGrow: 1 },
  panel: { borderRadius: radius.md, padding: spacing.base },
  section: { gap: spacing.sm },
});
