package com.stracks.sports.racket;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalInt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.CalorieEstimator;
import com.stracks.core.activity.domain.MetricsSchema;
import com.stracks.core.activity.domain.SportFamily;
import com.stracks.core.activity.domain.SportStats;
import com.stracks.core.activity.domain.TimerSportPlugin;
import com.stracks.core.activity.domain.TrackPointEntity;
import com.stracks.core.user.AthleteProfile;

/**
 * What every racket sport shares: a match is a timer plus a score in sets; the module
 * derives who won. What differs between tennis, padel, badminton, squash and table tennis
 * is the shape of a set (how many points, how many sets) and the effort.
 *
 * Metrics schema v1:
 * { schemaVersion, format: singles|doubles, sets: [{ won, lost }],
 *   setsWon, setsLost, result: win|loss|draw (derived) }
 *
 * <p>{@code won}/{@code lost} are the points (or games) of a set from the user's side.
 * A set with equal scores counts for nobody.
 */
abstract class RacketSportPlugin extends TimerSportPlugin {

    static final SportFamily FAMILY = new SportFamily("racket", "Sports de raquette");
    static final int SCHEMA_VERSION = 1;

    /** Highest score a set can reach in this sport (games for tennis, points elsewhere). */
    protected abstract int maxSetScore();

    /** Most sets a match can have. */
    protected abstract int maxSets();

    /** MET in singles and doubles (Compendium of Physical Activities). */
    protected abstract double metSingles();

    protected abstract double metDoubles();

    private MetricsSchema schema;

    @Override
    protected MetricsSchema schema() {
        if (schema == null) {
            MetricsSchema set = MetricsSchema.object()
                    .integer("won", 0, maxSetScore())
                    .integer("lost", 0, maxSetScore())
                    .required("won", "lost");
            schema = MetricsSchema.object()
                    .enumeration("format", "singles", "doubles")
                    .array("sets", set, maxSets())
                    .computed("setsWon", "setsLost", "result");
        }
        return schema;
    }

    @Override
    protected void derive(ObjectNode metrics, ActivityEntity activity) {
        int won = 0;
        int lost = 0;
        JsonNode sets = metrics.get("sets");
        if (sets != null && sets.isArray()) {
            for (JsonNode set : sets) {
                int w = set.path("won").asInt();
                int l = set.path("lost").asInt();
                if (w > l) {
                    won++;
                } else if (l > w) {
                    lost++;
                }
            }
        }
        metrics.put("setsWon", won);
        metrics.put("setsLost", lost);
        // No set at all isn't a draw: the score simply wasn't kept, and nothing is claimed.
        if (won + lost > 0) {
            metrics.put("result", won > lost ? "win" : won < lost ? "loss" : "draw");
        }
    }

    @Override
    public OptionalInt estimateCalories(ActivityEntity activity, List<TrackPointEntity> track,
            AthleteProfile athlete) {
        boolean doubles = activity.metrics != null && "doubles".equals(activity.metrics.path("format").asText());
        return CalorieEstimator.estimate(doubles ? metDoubles() : metSingles(), athlete, activity.durationS);
    }

    @Override
    public SportStats computeStats(List<ActivityEntity> activities) {
        Map<String, Double> totals = new LinkedHashMap<>();
        totals.put("matchesWon", countMetric(activities, "result", "win"));
        totals.put("matchesLost", countMetric(activities, "result", "loss"));
        totals.put("setsWon", sumMetric(activities, "setsWon"));
        return SportStats.of(descriptor(), activities, totals);
    }
}
