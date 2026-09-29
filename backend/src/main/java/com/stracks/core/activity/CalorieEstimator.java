package com.stracks.core.activity;

import java.util.OptionalInt;

import com.stracks.core.user.AthleteProfile;

/**
 * MET to kilocalories conversion. Generic by design, like {@link GpsComputations}:
 * the core holds the arithmetic, each sport module supplies the MET matching ITS effort.
 *
 * <p>Formula from the Compendium of Physical Activities:
 * {@code kcal = MET × 3.5 × weight(kg) / 200 × duration(min)}.
 *
 * <p>Without a known weight, the method returns nothing. This is deliberate: a calorie
 * estimate without the person's weight would be a made-up number, and the PRD forbids
 * displaying one.
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

    /** Average speed in km/h, or 0 when it can't be computed. */
    public static double averageSpeedKmh(double distanceM, Integer durationS) {
        if (durationS == null || durationS <= 0 || distanceM <= 0) {
            return 0;
        }
        return (distanceM / 1000.0) / (durationS / 3600.0);
    }
}
