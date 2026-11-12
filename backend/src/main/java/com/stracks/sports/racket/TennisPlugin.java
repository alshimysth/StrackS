package com.stracks.sports.racket;

import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/** Tennis: sets counted in games, 7 at most with a tie-break; up to 5 sets. */
@ApplicationScoped
public class TennisPlugin extends RacketSportPlugin {

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("tennis", "Tennis", FAMILY, TrackingMode.TIMER, SCHEMA_VERSION);
    }

    @Override
    protected int maxSetScore() {
        return 7;
    }

    @Override
    protected int maxSets() {
        return 5;
    }

    /** Compendium 15675 singles, 15660 doubles. */
    @Override
    protected double metSingles() {
        return 8.0;
    }

    @Override
    protected double metDoubles() {
        return 6.0;
    }
}
