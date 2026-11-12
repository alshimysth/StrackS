package com.stracks.sports.climbing;

import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;

import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Rope climbing (lead and top-rope): routes with French grades ("6a+"), sent on sight,
 * flashed, or redpointed after working the route.
 */
@ApplicationScoped
public class RopeClimbingPlugin extends ClimbingPlugin {

    /** Compendium 15533 rock climbing, ascending: 7.5. */
    private static final double MET = 7.5;

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("rope_climbing", "Voie", FAMILY, TrackingMode.TIMER, SCHEMA_VERSION);
    }

    @Override
    protected Pattern gradePattern() {
        return FrenchGrade.ROUTE;
    }

    @Override
    protected Function<String, Optional<FrenchGrade>> gradeParser() {
        return FrenchGrade::parseRoute;
    }

    @Override
    protected Function<FrenchGrade, String> gradeLabel() {
        return FrenchGrade::routeLabel;
    }

    @Override
    protected List<String> sendResults() {
        return List.of("onsight", "flash", "redpoint");
    }

    @Override
    protected double met() {
        return MET;
    }

    @Override
    protected String gradeHint() {
        return "une cotation voie (ex. 5c, 6a+, 7b)";
    }
}
