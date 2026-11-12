package com.stracks.sports.racket;

import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/** Squash: point-a-rally to 11 (two clear), best of 5 games. */
@ApplicationScoped
public class SquashPlugin extends RacketSportPlugin {

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("squash", "Squash", FAMILY, TrackingMode.TIMER, SCHEMA_VERSION);
    }

    @Override
    protected int maxSetScore() {
        return 30;
    }

    @Override
    protected int maxSets() {
        return 5;
    }

    /** Compendium 15650 squash, general: 12.0. Doubles is rare and less intense. */
    @Override
    protected double metSingles() {
        return 12.0;
    }

    @Override
    protected double metDoubles() {
        return 9.0;
    }
}
