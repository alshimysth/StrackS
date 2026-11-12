package com.stracks.sports.racket;

import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/** Table tennis: games to 11 (two clear, no cap), best of 7. */
@ApplicationScoped
public class TableTennisPlugin extends RacketSportPlugin {

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("table_tennis", "Tennis de table", FAMILY, TrackingMode.TIMER, SCHEMA_VERSION);
    }

    /** Deuce can run long: generous ceiling, the schema only catches a typo. */
    @Override
    protected int maxSetScore() {
        return 60;
    }

    @Override
    protected int maxSets() {
        return 7;
    }

    /** Compendium 15670 table tennis: 4.0. */
    @Override
    protected double metSingles() {
        return 4.0;
    }

    @Override
    protected double metDoubles() {
        return 4.0;
    }
}
