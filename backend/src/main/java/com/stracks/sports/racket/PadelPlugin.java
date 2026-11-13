package com.stracks.sports.racket;

import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/** Padel: tennis scoring in games, best of 3 sets, almost always played in doubles. */
@ApplicationScoped
public class PadelPlugin extends RacketSportPlugin {

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("padel", "Padel", FAMILY, TrackingMode.TIMER, SCHEMA_VERSION);
    }

    @Override
    protected int maxSetScore() {
        return 7;
    }

    @Override
    protected int maxSets() {
        return 3;
    }

    /** No Compendium entry: aligned on tennis doubles, slightly above for the smaller court rallies. */
    @Override
    protected double metSingles() {
        return 7.0;
    }

    @Override
    protected double metDoubles() {
        return 6.0;
    }
}
