package com.stracks.core.activity;

import java.util.function.Function;

/**
 * Une grandeur dont un sport tient un record personnel (#61).
 *
 * <p>Le socle ne sait pas ce qui mérite un record : la plus longue distance a un sens en
 * course, pas en musculation, où ce serait la charge. Chaque plugin déclare donc ses
 * mesures ; le socle, lui, n'en impose qu'une, que toute activité possède — la durée.
 *
 * @param key   camelCase avec l'unité en suffixe, même convention que {@link SportStats}
 * @param label libellé affiché tel quel par le client (« Plus longue distance »)
 * @param unit  unité SI de la valeur ({@code m}, {@code s}) — le client formate
 * @param value extraction de la valeur ; {@code null} = pas de valeur pour cette séance
 */
public record PersonalRecordMetric(
        String key,
        String label,
        String unit,
        Function<ActivityEntity, Double> value) {

    /** La seule mesure que le socle connaisse : toute activité a une durée. */
    public static final PersonalRecordMetric LONGEST_DURATION = new PersonalRecordMetric(
            "durationS", "Plus longue séance", "s",
            a -> a.durationS == null ? null : a.durationS.doubleValue());
}
