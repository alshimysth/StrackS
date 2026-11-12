package com.stracks.core.activity.domain;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.stracks.core.common.ApiException;

/**
 * Declarative validation of a {@code metrics} JSONB.
 *
 * <p>Every plugin used to hand-roll the same loop: type check per field, bounds, then a
 * sweep rejecting unknown keys. Fourteen copies of that loop would be fourteen places to
 * get subtly wrong. A plugin now <em>declares</em> its schema and the core enforces it,
 * with the same error wording everywhere.
 *
 * <p>Rules shared by every schema: every declared field is optional unless
 * {@link #required}; {@code schemaVersion} is always accepted as an integer; a key that
 * isn't declared is rejected (strict write, see {@code PreferencesService} for the same
 * asymmetry). {@link #computed} keys are the ones the server derives: a client echoing a
 * full document back (edit after the fact) must not be rejected for it, and the server
 * overwrites them anyway.
 *
 * <p>Errors carry the JSON path ("sets[2].won") so that the client can point at the field.
 */
public final class MetricsSchema {

    @FunctionalInterface
    private interface Check {
        void apply(JsonNode value, String path);
    }

    private final Map<String, Check> fields = new LinkedHashMap<>();
    private final Set<String> required = new LinkedHashSet<>();
    private final Set<String> computed = new LinkedHashSet<>();

    private MetricsSchema() {
    }

    public static MetricsSchema object() {
        return new MetricsSchema();
    }

    /** A number within {@code [min, max]}. */
    public MetricsSchema number(String key, double min, double max) {
        fields.put(key, (v, path) -> {
            if (!v.isNumber()) {
                throw invalid(path + " doit être un nombre.");
            }
            double d = v.asDouble();
            if (Double.isNaN(d) || d < min || d > max) {
                throw invalid(path + " doit être compris entre " + fmt(min) + " et " + fmt(max) + ".");
            }
        });
        return this;
    }

    /** A positive number (zero included), without an upper bound. */
    public MetricsSchema positiveNumber(String key) {
        return number(key, 0, Double.MAX_VALUE);
    }

    /** An integer within {@code [min, max]}. */
    public MetricsSchema integer(String key, int min, int max) {
        fields.put(key, (v, path) -> {
            if (!v.isIntegralNumber()) {
                throw invalid(path + " doit être un entier.");
            }
            long l = v.asLong();
            if (l < min || l > max) {
                throw invalid(path + " doit être compris entre " + min + " et " + max + ".");
            }
        });
        return this;
    }

    /** A string among the given values. */
    public MetricsSchema enumeration(String key, String... values) {
        List<String> allowed = List.of(values);
        fields.put(key, (v, path) -> {
            if (!v.isTextual() || !allowed.contains(v.asText())) {
                throw invalid(path + " doit valoir " + allowed + ".");
            }
        });
        return this;
    }

    /** A string matching a pattern; {@code hint} says what a valid value looks like. */
    public MetricsSchema pattern(String key, Pattern pattern, String hint) {
        fields.put(key, (v, path) -> {
            if (!v.isTextual() || !pattern.matcher(v.asText()).matches()) {
                throw invalid(path + " doit être " + hint + ".");
            }
        });
        return this;
    }

    /** An array of at most {@code maxItems} objects, each validated by {@code items}. */
    public MetricsSchema array(String key, MetricsSchema items, int maxItems) {
        fields.put(key, (v, path) -> {
            if (!v.isArray()) {
                throw invalid(path + " doit être un tableau.");
            }
            if (v.size() > maxItems) {
                throw invalid(path + " ne peut pas dépasser " + maxItems + " éléments.");
            }
            for (int i = 0; i < v.size(); i++) {
                items.validate(v.get(i), path + "[" + i + "]");
            }
        });
        return this;
    }

    /** Keys the server derives itself: accepted on input, never trusted. */
    public MetricsSchema computed(String... keys) {
        computed.addAll(List.of(keys));
        return this;
    }

    public MetricsSchema required(String... keys) {
        for (String key : keys) {
            if (!fields.containsKey(key)) {
                throw new IllegalStateException("Required key not declared: " + key);
            }
            required.add(key);
        }
        return this;
    }

    /** Keys this schema derives, so a plugin can strip them before re-deriving. */
    public Set<String> computedKeys() {
        return Set.copyOf(computed);
    }

    public void validate(JsonNode metrics) {
        validate(metrics, "metrics");
    }

    void validate(JsonNode node, String path) {
        if (node == null || !node.isObject()) {
            throw invalid(path + " doit être un objet JSON.");
        }
        for (String key : required) {
            if (!node.hasNonNull(key)) {
                throw invalid(path + "." + key + " est obligatoire.");
            }
        }
        List<String> unknown = new ArrayList<>();
        Iterator<Map.Entry<String, JsonNode>> entries = node.fields();
        while (entries.hasNext()) {
            Map.Entry<String, JsonNode> entry = entries.next();
            String key = entry.getKey();
            JsonNode value = entry.getValue();
            if ("schemaVersion".equals(key)) {
                if (!value.isIntegralNumber()) {
                    throw invalid(path + ".schemaVersion doit être un entier.");
                }
                continue;
            }
            if (computed.contains(key)) {
                continue;
            }
            Check check = fields.get(key);
            if (check == null) {
                unknown.add(key);
                continue;
            }
            if (value.isNull()) {
                continue; // an explicit null means "not reported", like an absent key
            }
            check.apply(value, path + "." + key);
        }
        if (!unknown.isEmpty()) {
            throw invalid("Champ inconnu dans " + path + " : " + String.join(", ", unknown));
        }
    }

    private static ApiException invalid(String detail) {
        return ApiException.invalidMetrics(detail);
    }

    private static String fmt(double d) {
        if (d == Double.MAX_VALUE) {
            return "∞";
        }
        return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d);
    }
}
