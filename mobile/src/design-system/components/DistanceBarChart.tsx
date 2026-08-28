/**
 * Distance par intervalle, empilée par sport (#24).
 *
 * Le seul graphique du produit. Règles de dataviz appliquées, chacune pour une
 * raison qui se voit à l'écran :
 *
 * - **Un seul axe.** Distance uniquement. Ajouter la durée demanderait une
 *   seconde échelle, dont l'alignement avec la première serait arbitraire — le
 *   graphique inventerait une corrélation absente des données.
 * - **La couleur suit le sport, jamais son rang.** Filtrer sur la course ne
 *   repeint pas les barres restantes ; qui a appris « la marche est verte » ne
 *   se fait pas piéger.
 * - **Étiquette directe sur le seul pic.** Un nombre sur chaque barre ne se lit
 *   plus ; les autres valeurs passent par la sélection et la légende.
 * - **Écart de 2 px en couleur de surface** entre segments empilés, plutôt qu'un
 *   trait de séparation : un contour ajouterait de l'encre qui n'est pas de la
 *   donnée.
 * - **Le texte ne porte jamais la couleur de la série** — l'identité vient de la
 *   pastille posée à côté, pas de la teinte des caractères.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dataSeriesColors, radius, spacing, typography } from '../theme';
import { useTheme } from '../use-theme';
import { useFormat, type Formatter } from '../../core/format/use-format';
import type { StatsTimeline, TimelineBucket } from '../../types/api';

const PLOT_HEIGHT = 158;
const SEGMENT_GAP = 2;
/**
 * Une sortie de 300 m dans un mois à 40 km ferait moins d'un pixel. On lui en
 * garantit trois : une barre invisible se lit « aucune séance », ce qui est faux.
 * La distorsion reste sous 2 % de la hauteur du tracé et ne change aucun ordre.
 */
const MIN_VISIBLE_HEIGHT = 3;

interface Props {
  timeline: StatsTimeline;
  /** Libellés des sports, tels que le backend les nomme. */
  labels: Record<string, string>;
}

export function DistanceBarChart({ timeline, labels }: Props) {
  const format = useFormat();
  const theme = useTheme();
  const buckets = timeline.buckets;

  const totals = buckets.map(bucketDistance);
  const max = Math.max(...totals, 0);
  const peakIndex = max > 0 ? totals.indexOf(max) : -1;
  const [selected, setSelected] = React.useState<number | null>(null);
  const highlighted = selected ?? peakIndex;

  // L'ordre des sports est figé sur l'ensemble du graphique : trier par valeur
  // dans chaque colonne ferait sauter les couleurs d'un intervalle à l'autre.
  const sports = seriesOrder(buckets);

  if (max <= 0) {
    return (
      <Text style={[typography.body, { color: theme.textSecondary }]}>
        Aucune distance enregistrée sur cette période.
      </Text>
    );
  }

  return (
    <View style={styles.chart} testID="distance-chart">
      <View style={styles.plot} accessibilityRole="image" accessibilityLabel={summaryLabel(timeline, labels, format)}>
        {buckets.map((bucket, index) => {
          const total = totals[index];
          const isHighlighted = index === highlighted;
          return (
            <Pressable
              key={bucket.start}
              testID={`chart-bucket-${index}`}
              onPress={() => setSelected(index === selected ? null : index)}
              accessibilityRole="button"
              accessibilityState={{ selected: isHighlighted }}
              accessibilityLabel={`${bucketLabel(bucket, timeline.bucket)} : ${format.distance(total)} ${format.distanceUnit}`}
              style={styles.column}
            >
              {/* Hauteur réservée en permanence : sans elle, afficher la valeur
                  ferait monter et descendre toute la colonne à chaque sélection. */}
              <Text
                numberOfLines={1}
                style={[
                  styles.valueLabel,
                  { color: isHighlighted ? theme.textPrimary : 'transparent' },
                ]}
              >
                {total > 0 ? format.distance(total) : ''}
              </Text>

              <View style={styles.stackArea}>
                <Stack
                  bucket={bucket}
                  sports={sports}
                  total={total}
                  max={max}
                  surface={theme.surfaceCard}
                  zeroRule={theme.borderSubtle}
                  testID={`chart-stack-${index}`}
                />
              </View>

              <Text
                numberOfLines={1}
                style={[
                  styles.axisLabel,
                  { color: isHighlighted ? theme.textPrimary : theme.textTertiary },
                ]}
              >
                {bucketLabel(bucket, timeline.bucket)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Légende dès DEUX séries : l'identité ne repose alors jamais sur la seule
          couleur, et elle est chiffrée — c'est aussi le total par sport. Une série
          unique s'en passe : le titre du graphique dit déjà ce qui est tracé, et
          une pastille seule ne ferait que le répéter. */}
      {sports.length > 1 && (
      <View style={styles.legend}>
        {sports.map((sport) => (
          <View key={sport} style={styles.legendItem}>
            <View
              style={[styles.swatch, { backgroundColor: seriesColor(sport, theme.textSecondary) }]}
            />
            <Text style={[typography.caption, { color: theme.textSecondary }]}>
              {labels[sport] ?? sport} · {format.distance(seriesTotal(buckets, sport))} {format.distanceUnit}
            </Text>
          </View>
        ))}
      </View>
      )}
    </View>
  );
}

function Stack({
  bucket,
  sports,
  total,
  max,
  surface,
  zeroRule,
  testID,
}: {
  bucket: TimelineBucket;
  sports: string[];
  total: number;
  max: number;
  surface: string;
  zeroRule: string;
  testID: string;
}) {
  if (total <= 0) {
    // L'intervalle existe et vaut zéro : un filet à la ligne de base le dit,
    // là où une colonne absente se lirait « données manquantes ».
    return <View testID={`${testID}-zero`} style={[styles.zeroRule, { backgroundColor: zeroRule }]} />;
  }

  const columnHeight = Math.max((total / max) * PLOT_HEIGHT, MIN_VISIBLE_HEIGHT);
  const present = sports
    .map((sport) => ({ sport, value: distanceOf(bucket, sport) }))
    .filter((entry) => entry.value > 0);

  // Les écarts sont pris sur la hauteur utile, pas ajoutés par-dessus : sinon
  // une colonne à trois sports dépasserait une colonne à un sport de même valeur.
  const gaps = SEGMENT_GAP * Math.max(present.length - 1, 0);
  const usable = Math.max(columnHeight - gaps, MIN_VISIBLE_HEIGHT);

  return (
    <View testID={testID} style={[styles.stack, { height: columnHeight }]}>
      {present.map((entry, index) => (
        <View
          key={entry.sport}
          testID={`${testID}-${entry.sport}`}
          style={[
            {
              height: Math.max((entry.value / total) * usable, MIN_VISIBLE_HEIGHT),
              backgroundColor: seriesColor(entry.sport, surface),
            },
            // Coin arrondi en haut de pile seulement — le bas est ancré à la
            // ligne de base et doit rester carré.
            index === 0 && styles.stackTop,
            index > 0 && { marginTop: SEGMENT_GAP },
          ]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dérivations
// ---------------------------------------------------------------------------

export function bucketDistance(bucket: TimelineBucket): number {
  return bucket.bySport.reduce((sum, value) => sum + value.distanceM, 0);
}

function distanceOf(bucket: TimelineBucket, sport: string): number {
  return bucket.bySport.find((value) => value.sportType === sport)?.distanceM ?? 0;
}

export function seriesTotal(buckets: TimelineBucket[], sport: string): number {
  return buckets.reduce((sum, bucket) => sum + distanceOf(bucket, sport), 0);
}

/**
 * Ordre d'empilement, stable sur tout le graphique : premier vu, premier posé.
 * Le tri par valeur ferait changer l'ordre des segments d'une colonne à l'autre.
 */
export function seriesOrder(buckets: TimelineBucket[]): string[] {
  const seen: string[] = [];
  for (const bucket of buckets) {
    for (const value of bucket.bySport) {
      if (value.distanceM > 0 && !seen.includes(value.sportType)) {
        seen.push(value.sportType);
      }
    }
  }
  return seen;
}

/** Un sport inconnu du design system retombe sur une neutre plutôt que sur rien. */
function seriesColor(sport: string, fallback: string): string {
  return dataSeriesColors[sport] ?? fallback;
}

export function bucketLabel(bucket: TimelineBucket, unit: StatsTimeline['bucket']): string {
  const date = new Date(bucket.start);
  if (unit === 'day') {
    return date.toLocaleDateString('fr-FR', { weekday: 'narrow' });
  }
  if (unit === 'month') {
    return date.toLocaleDateString('fr-FR', { month: 'narrow' });
  }
  // Semaine : le jour de son lundi, la seule étiquette qui tient sous une barre.
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

/**
 * Libellé d'accessibilité du graphe. Helper pur : le formateur lui est passé, il
 * n'appelle pas de hook — la fonction est aussi utilisée hors rendu.
 */
function summaryLabel(
  timeline: StatsTimeline,
  labels: Record<string, string>,
  format: Formatter,
): string {
  const sports = seriesOrder(timeline.buckets)
    .map(
      (sport) =>
        `${labels[sport] ?? sport} ${format.distance(seriesTotal(timeline.buckets, sport))} ${format.distanceUnit}`,
    )
    .join(', ');
  return `Distance par intervalle. ${sports || 'aucune donnée'}.`;
}

const styles = StyleSheet.create({
  chart: { gap: spacing.md },
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  column: { flex: 1, alignItems: 'center', gap: 6 },
  stackArea: { height: PLOT_HEIGHT, width: '100%', justifyContent: 'flex-end' },
  stack: { width: '100%', justifyContent: 'flex-end' },
  stackTop: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  zeroRule: { height: 2, width: '100%', borderRadius: 1 },
  valueLabel: { ...typography.caption, fontVariant: ['tabular-nums'], height: 14 },
  axisLabel: { ...typography.caption, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.base },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 11, height: 11, borderRadius: 3 },
});
