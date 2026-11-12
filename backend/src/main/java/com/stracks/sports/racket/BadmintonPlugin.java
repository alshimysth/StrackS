package com.stracks.sports.racket;

import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/** Badminton: rally scoring to 21, capped at 30; best of 3 games. */
@ApplicationScoped
public class BadmintonPlugin extends RacketSportPlugin {

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("badminton", "Badminton", FAMILY, TrackingMode.TIMER, SCHEMA_VERSION);
    }

    @Override
    protected int maxSetScore() {
        return 30;
    }

    @Override
    protected int maxSets() {
        return 3;
    }

    /** Compendium 15020 competitive (7.0), 15030 social doubles (5.5). */
    @Override
    protected double metSingles() {
        return 7.0;
    }

    @Override
    protected double metDoubles() {
        return 5.5;
    }
}
