package com.stracks.core.activity;

import java.util.Map;

/**
 * Agrégats d'un sport sur une période.
 *
 * <p>Le socle ne connaît que ce que <em>toute</em> activité possède : un nombre de
 * séances et une durée. Tout le reste — distance, dénivelé, charge soulevée,
 * longueurs de bassin — est nommé par le plugin dans {@code totals}. Lister ces
 * métriques comme des champs de ce record obligerait à modifier {@code core/} à
 * chaque nouveau sport, ce que le pattern plugin interdit ; et le socle finirait
 * par additionner un dénivelé pour un sport en salle qui n'en a pas (#46).
 *
 * <p>Conventions des clés de {@code totals} : camelCase, unité en suffixe
 * («&nbsp;distanceM&nbsp;», «&nbsp;elevationGainM&nbsp;»). Deux sports qui mesurent
 * la même grandeur emploient la <strong>même clé</strong> — c'est précisément ce qui
 * permet au socle de les additionner sans rien comprendre à ce qu'il additionne.
 */
public record SportStats(
        String sportType,
        String label,
        int sessions,
        long totalDurationS,
        Map<String, Double> totals) {

    public SportStats {
        totals = totals == null ? Map.of() : Map.copyOf(totals);
    }
}
