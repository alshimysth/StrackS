package com.stracks.core.user;

import java.time.LocalDate;
import java.time.Period;
import java.util.OptionalInt;

/**
 * A user's athlete profile, in a form usable by sport modules (energy expenditure
 * estimate, later effort zones).
 *
 * <p>Every field is optional: the app works fully without them. A module that can't
 * compute with what it receives must return nothing, never a made-up value.
 *
 * <p>Generic by design: no sport appears here.
 */
public record AthleteProfile(Double weightKg, Double heightCm, LocalDate birthDate, String sex) {

    public static final AthleteProfile EMPTY = new AthleteProfile(null, null, null, null);

    /** True only when the weight is known, the only data the MET computation requires. */
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
