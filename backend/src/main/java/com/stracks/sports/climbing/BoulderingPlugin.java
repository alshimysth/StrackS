package com.stracks.sports.climbing;

import java.util.List;
import java.util.Optional;
import java.util.function.Function;

import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Bouldering: short problems, Fontainebleau grades ("6A+"), sent on the first go (flash)
 * or after several tries (send).
 */
@ApplicationScoped
public class BoulderingPlugin extends ClimbingPlugin {

    /** Compendium 15533 rock climbing (8.0) weighted by the resting that bouldering implies. */
    private static final double MET = 6.0;

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("bouldering", "Bloc", FAMILY, TrackingMode.TIMER, SCHEMA_VERSION);
    }

    @Override
    protected Function<String, Optional<FrenchGrade>> gradeParser() {
        return FrenchGrade::parseBoulder;
    }

    @Override
    protected Function<FrenchGrade, String> gradeLabel() {
        return FrenchGrade::boulderLabel;
    }

    @Override
    protected List<String> sendResults() {
        return List.of("flash", "send");
    }

    @Override
    protected double met() {
        return MET;
    }

    @Override
    protected String gradeHint() {
        return "une cotation bloc (ex. 5+, 6A, 7B+)";
    }
}
