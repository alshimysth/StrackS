package com.stracks.core.activity.domain;

import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Base of every timed sport: no track, the client reports what happened (routes climbed,
 * sets played, distance read on a treadmill) and the server derives the totals.
 *
 * <p>The division of labour mirrors the GPS case. There, the raw track is the source of
 * truth and the metrics are recomputed from it. Here, the client's report <em>is</em> the
 * raw data: it's validated strictly on input, stored as is, and the derived figures
 * (counts, result of the match, average speed) are always recomputed by the server, never
 * trusted from the client.
 */
public abstract class TimerSportPlugin implements SportPlugin {

    protected static final JsonNodeFactory json = JsonNodeFactory.instance;

    /** Schema of what the client may report; derived keys go in {@code computed}. */
    protected abstract MetricsSchema schema();

    /**
     * Derives the server-owned figures from the reported input. {@code metrics} is a
     * mutable copy of the client's report, with the derived keys already stripped: the
     * module writes them back from scratch.
     */
    protected abstract void derive(ObjectNode metrics, ActivityEntity activity);

    /** The distance to write in the core column, if this sport reports one. */
    protected Double distanceM(ObjectNode metrics) {
        return null;
    }

    @Override
    public final void validateMetrics(JsonNode metrics) {
        schema().validate(metrics);
    }

    @Override
    public final FinalMetrics complete(ActivityEntity activity, List<TrackPointEntity> track) {
        ObjectNode metrics = activity.metrics != null && activity.metrics.isObject()
                ? activity.metrics.deepCopy()
                : json.objectNode();
        for (String key : schema().computedKeys()) {
            metrics.remove(key);
        }
        metrics.put("schemaVersion", descriptor().schemaVersion());
        derive(metrics, activity);
        Double distance = distanceM(metrics);
        return distance == null ? FinalMetrics.of(metrics) : FinalMetrics.withDistance(metrics, distance);
    }

    /** Sum of a numeric key of the {@code metrics} JSONB over the activities. */
    protected static double sumMetric(List<ActivityEntity> activities, String key) {
        double total = 0;
        for (ActivityEntity a : activities) {
            if (a.metrics != null && a.metrics.hasNonNull(key) && a.metrics.get(key).isNumber()) {
                total += a.metrics.get(key).asDouble();
            }
        }
        return total;
    }

    /** Number of activities whose {@code key} equals {@code value}. */
    protected static double countMetric(List<ActivityEntity> activities, String key, String value) {
        int count = 0;
        for (ActivityEntity a : activities) {
            if (a.metrics != null && a.metrics.hasNonNull(key) && value.equals(a.metrics.get(key).asText())) {
                count++;
            }
        }
        return count;
    }
}
