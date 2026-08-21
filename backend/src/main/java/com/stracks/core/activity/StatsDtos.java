package com.stracks.core.activity;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** DTOs des agrégats statistiques. Aucun sport n'est nommé ici (voir {@link SportStats}). */
public final class StatsDtos {

    private StatsDtos() {
    }

    /**
     * Totaux d'une fenêtre, tous sports confondus. {@code totals} agrège clé par clé
     * ce que les plugins ont nommé : une clé absente signifie « aucun sport de la
     * période ne mesure cette grandeur », ce qui n'est pas la même chose que zéro.
     */
    public record StatsTotals(
            int sessions,
            long durationS,
            Map<String, Double> totals) {
    }

    /**
     * Réponse de {@code GET /stats/summary}.
     *
     * <p>{@code previous} porte la même fenêtre décalée d'une période (juin quand on
     * regarde juillet) : la comparaison exige une fenêtre <em>fermée</em> des deux
     * côtés, sinon on compare un mois entamé à un mois complet et l'évolution est
     * toujours négative.
     */
    public record StatsSummaryResponse(
            Instant from,
            Instant to,
            List<SportStats> bySport,
            int totalSessions,
            long totalDurationS,
            Map<String, Double> totals,
            StatsTotals previous) {
    }

    /**
     * Valeur d'un sport dans un intervalle du graphique.
     *
     * <p>Les trois grandeurs sont des <strong>colonnes du socle</strong>
     * ({@code status}, {@code duration_s}, {@code distance_m}) : le découpage
     * temporel se calcule donc en SQL sans qu'aucun plugin intervienne, et sans
     * jamais ouvrir le JSONB {@code metrics}. Un sport sans distance renvoie
     * simplement 0 et n'a pas de barre.
     */
    public record TimelineSportValue(
            String sportType,
            int sessions,
            long durationS,
            double distanceM) {
    }

    /** Un intervalle du graphique — un jour, une semaine ou un mois selon le zoom. */
    public record TimelineBucket(
            Instant start,
            Instant end,
            List<TimelineSportValue> bySport) {
    }

    /**
     * Réponse de {@code GET /stats/timeline}.
     *
     * <p>Les intervalles vides sont <strong>présents</strong> et à zéro : c'est au
     * serveur de dire que la semaine du 13 n'a rien, pas au client de le déduire
     * d'un trou dans la liste — sinon le graphique tasse ses barres et ment sur
     * l'espacement du temps.
     */
    public record StatsTimelineResponse(
            Instant from,
            Instant to,
            String bucket,
            List<TimelineBucket> buckets) {
    }
}
