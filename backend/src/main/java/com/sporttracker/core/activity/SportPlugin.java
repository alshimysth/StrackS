package com.sporttracker.core.activity;

import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Contrat d'un module de sport. Le socle ne connaît aucun sport : toute logique
 * spécifique passe par une implémentation de cette interface, découverte par CDI
 * et indexée dans {@link SportRegistry}. Ajouter un sport = ajouter une classe
 * dans sports/<code>/ — aucun fichier de core/ ne doit être modifié.
 */
public interface SportPlugin {

    /** Descripteur du sport (code, label, usesGps, version du schéma de métriques). */
    SportTypeDescriptor descriptor();

    /** Valide le JSONB metrics d'une activité de ce sport. Jette une 422 sinon. */
    void validateMetrics(JsonNode metrics);

    /**
     * Calcule/complète les métriques à la clôture d'une activité
     * (ex. running : allure moyenne, D+/D- à partir des track_points).
     */
    JsonNode computeFinalMetrics(ActivityEntity activity, List<TrackPointEntity> track);

    /** Agrège les stats de ce sport sur une liste d'activités (pour /stats). */
    SportStats computeStats(List<ActivityEntity> activities);

    /**
     * Vitesse plafond (km/h) pour le filtre de plausibilité GPS de ce sport.
     * Ignoré si usesGps() est faux.
     */
    default double maxGpsSpeedKmh() {
        return 30.0;
    }
}
