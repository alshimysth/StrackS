package com.stracks.core.activity;

import java.util.OptionalInt;

import com.stracks.core.user.AthleteProfile;

/**
 * Conversion MET → kilocalories. Générique par construction, au même titre que
 * {@link GpsComputations} : le socle porte l'arithmétique, chaque module de sport
 * fournit le MET qui correspond à SON effort.
 *
 * <p>Formule du Compendium of Physical Activities :
 * {@code kcal = MET × 3,5 × poids(kg) / 200 × durée(min)}.
 *
 * <p>Sans poids connu, la méthode ne renvoie rien. C'est délibéré : une estimation
 * calorique sans le poids de la personne serait un chiffre inventé, et le PRD
 * interdit d'en afficher.
 */
public final class CalorieEstimator {

    private CalorieEstimator() {
    }

    public static OptionalInt estimate(double met, AthleteProfile athlete, Integer durationS) {
        if (athlete == null || !athlete.hasWeight() || durationS == null || durationS <= 0 || met <= 0) {
            return OptionalInt.empty();
        }
        double minutes = durationS / 60.0;
        double kcal = met * 3.5 * athlete.weightKg() / 200.0 * minutes;
        int rounded = (int) Math.round(kcal);
        return rounded > 0 ? OptionalInt.of(rounded) : OptionalInt.empty();
    }

    /** Vitesse moyenne en km/h, ou 0 si elle n'est pas calculable. */
    public static double averageSpeedKmh(double distanceM, Integer durationS) {
        if (durationS == null || durationS <= 0 || distanceM <= 0) {
            return 0;
        }
        return (distanceM / 1000.0) / (durationS / 3600.0);
    }
}
