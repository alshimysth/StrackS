package com.stracks.core.activity;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Moteur de calcul GPS partagé entre les sports géolocalisés (course, marche,
 * demain vélo/trail). Recalcule tout depuis les track_points bruts stockés :
 * la donnée brute reste la source de vérité, les métriques sont rejouables.
 *
 * Filtres (cf. wiki Running-App-Mechanics, 2026-07-13) :
 *  - précision horizontale : points au-delà de MAX_ACCURACY_M écartés ;
 *  - plausibilité : segments plus rapides que maxSpeedKmh écartés (bruit GPS) ;
 *  - dénivelé : altitude lissée (moyenne mobile 5 points) + hystérésis de 2 m
 *    avant d'accumuler — l'altitude GPS brute surestime fortement le D+.
 */
public final class GpsComputations {

    public static final double MAX_ACCURACY_M = 50.0;

    /**
     * Au-delà de ce trou entre deux points retenus, le signal est considéré comme perdu et
     * le segment n'est PAS compté (#19). Sans cette règle, une traversée de tunnel ajoute la
     * corde entre l'entrée et la sortie : le filtre de plausibilité ne l'attrape pas (1 km en
     * 5 min = 12 km/h, plausible pour un coureur), et une distance parcourue en ligne droite
     * est comptée alors qu'elle ne l'a pas été.
     *
     * MIROIR EXACT de metrics.ts SIGNAL_LOST_MS — toute modification ici doit être répercutée
     * côté client, sinon l'affichage live diverge du recalcul au stop (parité verrouillée #40).
     */
    public static final long SIGNAL_LOST_MS = 15_000L;
    public static final double ELEVATION_HYSTERESIS_M = 2.0;
    private static final int SMOOTHING_WINDOW = 5;
    private static final double EARTH_RADIUS_M = 6_371_000.0;

    public record Result(
            double distanceM,
            double elevationGainM,
            double elevationLossM,
            List<Split> splits) {
    }

    /** Split kilométrique : allure en secondes par km. */
    public record Split(int km, int paceSecPerKm) {
    }

    private GpsComputations() {
    }

    public static Result compute(List<TrackPointEntity> track, double maxSpeedKmh) {
        List<TrackPointEntity> usable = filter(track, maxSpeedKmh);

        double distance = 0;
        List<Split> splits = new ArrayList<>();
        double nextSplitAt = 1000;
        long splitStartMs = usable.isEmpty() ? 0 : usable.get(0).recordedAt.toEpochMilli();

        for (int i = 1; i < usable.size(); i++) {
            TrackPointEntity a = usable.get(i - 1);
            TrackPointEntity b = usable.get(i);
            long gapMs = b.recordedAt.toEpochMilli() - a.recordedAt.toEpochMilli();
            // Trou trop long : le point rouvre le tracé mais le segment n'est pas compté —
            // on ignore quel chemin a été suivi entre les deux.
            if (gapMs < SIGNAL_LOST_MS) {
                distance += haversineM(a.lat, a.lng, b.lat, b.lng);
            }

            if (distance >= nextSplitAt) {
                long elapsedMs = b.recordedAt.toEpochMilli() - splitStartMs;
                splits.add(new Split((int) (nextSplitAt / 1000), (int) (elapsedMs / 1000)));
                splitStartMs = b.recordedAt.toEpochMilli();
                nextSplitAt += 1000;
            }
        }

        double[] elevation = elevationGainLoss(usable);
        return new Result(distance, elevation[0], elevation[1], splits);
    }

    /** Distance haversine en mètres entre deux coordonnées. */
    public static double haversineM(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
    }

    private static List<TrackPointEntity> filter(List<TrackPointEntity> track, double maxSpeedKmh) {
        double maxSpeedMs = maxSpeedKmh / 3.6;
        List<TrackPointEntity> out = new ArrayList<>(track.size());
        TrackPointEntity previous = null;
        for (TrackPointEntity p : track) {
            if (p.accuracyM != null && p.accuracyM > MAX_ACCURACY_M) {
                continue;
            }
            if (previous != null) {
                double seconds = Duration.between(previous.recordedAt, p.recordedAt).toMillis() / 1000.0;
                if (seconds <= 0) {
                    continue;
                }
                double speed = haversineM(previous.lat, previous.lng, p.lat, p.lng) / seconds;
                if (speed > maxSpeedMs) {
                    continue;
                }
            }
            out.add(p);
            previous = p;
        }
        return out;
    }

    private static double[] elevationGainLoss(List<TrackPointEntity> track) {
        List<Double> altitudes = new ArrayList<>();
        for (TrackPointEntity p : track) {
            if (p.altitudeM != null) {
                altitudes.add(p.altitudeM);
            }
        }
        if (altitudes.size() < 2) {
            return new double[] { 0, 0 };
        }

        // Moyenne mobile centrée sur SMOOTHING_WINDOW points
        List<Double> smoothed = new ArrayList<>(altitudes.size());
        int half = SMOOTHING_WINDOW / 2;
        for (int i = 0; i < altitudes.size(); i++) {
            int from = Math.max(0, i - half);
            int to = Math.min(altitudes.size() - 1, i + half);
            double sum = 0;
            for (int j = from; j <= to; j++) {
                sum += altitudes.get(j);
            }
            smoothed.add(sum / (to - from + 1));
        }

        // Hystérésis : n'accumuler qu'une variation confirmée au-delà du seuil
        double gain = 0;
        double loss = 0;
        double reference = smoothed.get(0);
        for (double alt : smoothed) {
            double delta = alt - reference;
            if (delta >= ELEVATION_HYSTERESIS_M) {
                gain += delta;
                reference = alt;
            } else if (delta <= -ELEVATION_HYSTERESIS_M) {
                loss += -delta;
                reference = alt;
            }
        }
        return new double[] { gain, loss };
    }

    /**
     * Totaux d'un lot d'activités GPS, sous les clés attendues par {@link SportStats}.
     *
     * <p><strong>Outil, pas contrat.</strong> Le socle ne l'appelle jamais de lui-même :
     * c'est le plugin d'un sport géolocalisé qui choisit de s'en servir, exactement
     * comme il choisit {@link #compute}. Un sport sans GPS ne le voit pas et ne
     * déclare donc ni distance ni dénivelé — ce qui est tout l'intérêt.
     *
     * <p>Les deux clés sont toujours présentes, y compris à zéro : le sport déclare
     * ici ce qu'il <em>sait mesurer</em>, pas ce qu'il a mesuré cette semaine. Sans
     * ça, une semaine sans dénivelé ferait disparaître la ligne « D+ » de l'écran.
     */
    public static Map<String, Double> gpsTotals(List<ActivityEntity> activities) {
        double distanceM = 0;
        double elevationGainM = 0;
        for (ActivityEntity a : activities) {
            if (a.distanceM != null) {
                distanceM += a.distanceM.doubleValue();
            }
            if (a.metrics != null && a.metrics.hasNonNull("elevationGainM")) {
                elevationGainM += a.metrics.get("elevationGainM").asDouble();
            }
        }
        Map<String, Double> totals = new LinkedHashMap<>();
        totals.put("distanceM", distanceM);
        totals.put("elevationGainM", elevationGainM);
        return totals;
    }
}
