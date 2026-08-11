package com.stracks.core.user;

import java.time.LocalDate;
import java.time.Period;
import java.util.OptionalInt;

/**
 * Profil physique d'un utilisateur, sous une forme exploitable par les modules
 * de sport (estimation de dépense énergétique, plus tard zones d'effort).
 *
 * <p>Tous les champs sont facultatifs : l'application fonctionne intégralement
 * sans eux. Un module qui ne peut pas calculer avec ce qu'il reçoit ne doit
 * rien renvoyer — jamais une valeur inventée.
 *
 * <p>Générique par construction : aucun sport n'apparaît ici.
 */
public record AthleteProfile(Double weightKg, Double heightCm, LocalDate birthDate, String sex) {

    public static final AthleteProfile EMPTY = new AthleteProfile(null, null, null, null);

    /** Vrai seulement si le poids est connu — seule donnée indispensable au calcul MET. */
    public boolean hasWeight() {
        return weightKg != null && weightKg > 0;
    }

    public OptionalInt ageAt(LocalDate date) {
        if (birthDate == null || date == null || birthDate.isAfter(date)) {
            return OptionalInt.empty();
        }
        return OptionalInt.of(Period.between(birthDate, date).getYears());
    }
}
