package com.stracks.sports.climbing;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.function.Function;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.CalorieEstimator;
import com.stracks.core.activity.domain.MetricsSchema;
import com.stracks.core.activity.domain.PersonalRecordMetric;
import com.stracks.core.activity.domain.SportFamily;
import com.stracks.core.activity.domain.SportStats;
import com.stracks.core.activity.domain.TimerSportPlugin;
import com.stracks.core.activity.domain.TrackPointEntity;
import com.stracks.core.user.AthleteProfile;

/**
 * What bouldering and rope climbing share. A climbing session is a timer plus a log of
 * climbs; the module derives how many were tried, how many went, and the hardest one sent.
 *
 * Metrics schema v1:
 * { schemaVersion, location: indoor|outdoor,
 *   climbs: [{ grade, result, attempts }],
 *   climbsCount, sendsCount, attemptsTotal, hardestSentGrade, hardestSentOrdinal (derived) }
 *
 * <p>{@code result} says how the climb ended: {@code attempt} = not sent; the other values
 * are the discipline's ways of sending ({@link #sendResults()}). {@code attempts} counts
 * the tries on that climb during the session.
 */
abstract class ClimbingPlugin extends TimerSportPlugin {

    static final SportFamily FAMILY = new SportFamily("climbing", "Escalade");
    static final int SCHEMA_VERSION = 1;
    static final int MAX_CLIMBS = 200;
    static final int MAX_ATTEMPTS = 100;

    /** Grade pattern of the discipline, and the matching parser. */
    protected abstract Pattern gradePattern();

    protected abstract Function<String, Optional<FrenchGrade>> gradeParser();

    /** Label of a grade in the discipline's notation. */
    protected abstract Function<FrenchGrade, String> gradeLabel();

    /** Ways of sending in this discipline, {@code attempt} excluded. */
    protected abstract List<String> sendResults();

    /** MET of the discipline (Compendium 15533 rock climbing, adjusted for rest time). */
    protected abstract double met();

    /** A hint for the error message: what a valid grade looks like. */
    protected abstract String gradeHint();

    private MetricsSchema schema;

    @Override
    protected MetricsSchema schema() {
        if (schema == null) {
            List<String> results = new java.util.ArrayList<>(sendResults());
            results.add("attempt");
            MetricsSchema climb = MetricsSchema.object()
                    .pattern("grade", gradePattern(), gradeHint())
                    .enumeration("result", results.toArray(String[]::new))
                    .integer("attempts", 1, MAX_ATTEMPTS)
                    .required("grade", "result");
            schema = MetricsSchema.object()
                    .enumeration("location", "indoor", "outdoor")
                    .array("climbs", climb, MAX_CLIMBS)
                    .computed("climbsCount", "sendsCount", "attemptsTotal", "hardestSentGrade", "hardestSentOrdinal");
        }
        return schema;
    }

    @Override
    protected void derive(ObjectNode metrics, ActivityEntity activity) {
        JsonNode climbs = metrics.get("climbs");
        int count = 0;
        int sends = 0;
        int attempts = 0;
        FrenchGrade hardest = null;
        if (climbs != null && climbs.isArray()) {
            for (JsonNode climb : climbs) {
                count++;
                int tries = climb.hasNonNull("attempts") ? climb.get("attempts").asInt() : 1;
                attempts += tries;
                String result = climb.path("result").asText();
                if (sendResults().contains(result)) {
                    sends++;
                    Optional<FrenchGrade> grade = gradeParser().apply(climb.path("grade").asText());
                    if (grade.isPresent() && (hardest == null || grade.get().compareTo(hardest) > 0)) {
                        hardest = grade.get();
                    }
                }
            }
        }
        metrics.put("climbsCount", count);
        metrics.put("sendsCount", sends);
        metrics.put("attemptsTotal", attempts);
        if (hardest != null) {
            metrics.put("hardestSentGrade", gradeLabel().apply(hardest));
            metrics.put("hardestSentOrdinal", hardest.ordinal());
        }
    }

    @Override
    public OptionalInt estimateCalories(ActivityEntity activity, List<TrackPointEntity> track,
            AthleteProfile athlete) {
        return CalorieEstimator.estimate(met(), athlete, activity.durationS);
    }

    /**
     * The hardest send is the record a climber cares about. Its unit, {@code grade}, isn't
     * SI: the client's climbing module formats the ordinal back into a label.
     */
    @Override
    public List<PersonalRecordMetric> personalRecordMetrics() {
        return List.of(PersonalRecordMetric.ofMetric("hardestSentOrdinal", "Cotation la plus dure", "grade"));
    }

    @Override
    public SportStats computeStats(List<ActivityEntity> activities) {
        Map<String, Double> totals = new LinkedHashMap<>();
        totals.put("climbsCount", sumMetric(activities, "climbsCount"));
        totals.put("sendsCount", sumMetric(activities, "sendsCount"));
        return SportStats.of(descriptor(), activities, totals);
    }
}
