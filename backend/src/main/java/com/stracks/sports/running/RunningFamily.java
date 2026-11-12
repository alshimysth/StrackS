package com.stracks.sports.running;

import com.stracks.core.activity.domain.SportFamily;

/**
 * What the three running modules share: the family shown to the user and the MET table.
 *
 * <p>One package per family: road running, trail and treadmill are variants of the same
 * discipline and may share code, as the rule "a sport never depends on another sport"
 * applies between families, not within one.
 */
final class RunningFamily {

    static final SportFamily FAMILY = new SportFamily("running", "Course à pied");

    private RunningFamily() {
    }

    /**
     * Running MET by speed (Compendium of Physical Activities, codes 12020 to 12130).
     * A table specific to this family: the core doesn't need to know it.
     */
    static double met(double speedKmh) {
        if (speedKmh < 6.4) {
            return 6.0;
        } else if (speedKmh < 8.0) {
            return 8.3;
        } else if (speedKmh < 9.7) {
            return 9.0;
        } else if (speedKmh < 11.3) {
            return 9.8;
        } else if (speedKmh < 12.9) {
            return 11.0;
        } else if (speedKmh < 14.5) {
            return 11.8;
        } else if (speedKmh < 16.1) {
            return 12.8;
        }
        return 14.5;
    }
}
