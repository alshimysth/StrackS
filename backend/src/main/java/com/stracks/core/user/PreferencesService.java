package com.stracks.core.user;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.activity.SportRegistry;
import com.stracks.core.activity.SportTypeDescriptor;
import com.stracks.core.common.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * User preferences schema: defaults, validation and merging.
 *
 * <p><b>Deliberate asymmetry between reading and writing.</b> Reading is tolerant: an
 * unknown stored key is kept as is and ignored, a missing key gets its default, so an old
 * client and a recent one coexist without anything breaking. Writing is strict: an
 * unknown key is rejected with a 422, because silently accepting a typo would create a
 * preference that is never read.
 *
 * <p>The whole document lives in a single JSONB column: adding a preference requires no
 * migration.
 */
@ApplicationScoped
public class PreferencesService {

    private static final JsonNodeFactory json = JsonNodeFactory.instance;

    /** Known root keys. Any other key is rejected on write. */
    private static final Set<String> ROOT_KEYS = Set.of(
            "units", "theme", "defaultSport", "sportDisplay", "gpsMode",
            "countdownEnabled", "autoPauseEnabled", "weeklyGoal", "physical", "privacyZones");

    private static final Set<String> PHYSICAL_KEYS = Set.of("weightKg", "heightCm", "birthDate", "sex");
    private static final Set<String> GOAL_KEYS = Set.of("distanceM", "sessions");
    private static final Set<String> PRIVACY_ZONE_KEYS = Set.of("lat", "lng", "radiusM", "label");

    /** Beyond this, it's misuse: a zone protects a home, an office. */
    static final int MAX_PRIVACY_ZONES = 5;
    static final int MAX_PRIVACY_ZONE_LABEL = 40;

    private static final List<String> UNITS = List.of("metric", "imperial");
    private static final List<String> THEMES = List.of("auto", "light", "dark");
    private static final List<String> GPS_MODES = List.of("max", "balanced", "saver");
    private static final List<String> SPEED_DISPLAYS = List.of("pace", "speed");
    private static final List<String> SEXES = List.of("female", "male", "unspecified");

    @Inject
    SportRegistry registry;

    /**
     * Full document returned to the client: the defaults, overridden by what is stored.
     * Unknown keys possibly present in the database are copied as is: we never destroy a
     * preference we don't understand.
     */
    public ObjectNode withDefaults(JsonNode stored) {
        ObjectNode out = defaults();
        if (stored == null || !stored.isObject()) {
            return out;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = stored.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            JsonNode current = out.get(field.getKey());
            if (current != null && current.isObject() && field.getValue().isObject()) {
                ((ObjectNode) current).setAll((ObjectNode) field.getValue());
            } else {
                out.set(field.getKey(), field.getValue());
            }
        }
        return out;
    }

    private ObjectNode defaults() {
        ObjectNode root = json.objectNode();
        root.put("units", "metric");
        root.put("theme", "auto");
        root.putNull("defaultSport");
        root.set("sportDisplay", json.objectNode());
        root.put("gpsMode", "balanced");
        root.put("countdownEnabled", true);
        // Outside PRD v2.0: disabled until the product decision is made (#20)
        root.put("autoPauseEnabled", false);

        ObjectNode goal = root.putObject("weeklyGoal");
        goal.putNull("distanceM");
        goal.putNull("sessions");

        // Privacy zones (#37): empty by default, nothing is masked.
        root.putArray("privacyZones");

        ObjectNode physical = root.putObject("physical");
        physical.putNull("weightKg");
        physical.putNull("heightCm");
        physical.putNull("birthDate");
        physical.putNull("sex");
        return root;
    }

    /**
     * Validates a patch then merges it into the stored document. A {@code null} value
     * resets the preference to its default (the key is removed from storage rather than
     * forced to null).
     */
    public ObjectNode merge(JsonNode stored, JsonNode patch) {
        if (patch == null || !patch.isObject()) {
            throw ApiException.invalidPreference("Le corps de la requête doit être un objet JSON.");
        }
        validate(patch);

        ObjectNode result = stored != null && stored.isObject()
                ? ((ObjectNode) stored).deepCopy()
                : json.objectNode();

        Iterator<Map.Entry<String, JsonNode>> fields = patch.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            String key = field.getKey();
            JsonNode value = field.getValue();

            if (value.isNull()) {
                result.remove(key);
            } else if (value.isObject() && result.has(key) && result.get(key).isObject()) {
                ObjectNode target = (ObjectNode) result.get(key);
                Iterator<Map.Entry<String, JsonNode>> nested = value.fields();
                while (nested.hasNext()) {
                    Map.Entry<String, JsonNode> sub = nested.next();
                    if (sub.getValue().isNull()) {
                        target.remove(sub.getKey());
                    } else {
                        target.set(sub.getKey(), sub.getValue());
                    }
                }
            } else {
                result.set(key, value);
            }
        }
        return result;
    }

    private void validate(JsonNode patch) {
        Iterator<String> names = patch.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!ROOT_KEYS.contains(name)) {
                throw ApiException.invalidPreference("Préférence inconnue : " + name);
            }
        }

        enumField(patch, "units", UNITS);
        enumField(patch, "theme", THEMES);
        enumField(patch, "gpsMode", GPS_MODES);
        booleanField(patch, "countdownEnabled");
        booleanField(patch, "autoPauseEnabled");

        JsonNode sport = patch.get("defaultSport");
        if (sport != null && !sport.isNull()) {
            if (!sport.isTextual()) {
                throw ApiException.invalidPreference("defaultSport doit être un code de sport.");
            }
            registry.require(sport.asText()); // 422 if the sport isn't in the registry
        }

        JsonNode display = patch.get("sportDisplay");
        if (display != null && !display.isNull()) {
            if (!display.isObject()) {
                throw ApiException.invalidPreference("sportDisplay doit être un objet.");
            }
            List<String> known = registry.descriptors().stream().map(SportTypeDescriptor::code).toList();
            Iterator<Map.Entry<String, JsonNode>> entries = display.fields();
            while (entries.hasNext()) {
                Map.Entry<String, JsonNode> entry = entries.next();
                if (!known.contains(entry.getKey())) {
                    throw ApiException.unknownSport(entry.getKey());
                }
                if (!entry.getValue().isNull()
                        && (!entry.getValue().isTextual() || !SPEED_DISPLAYS.contains(entry.getValue().asText()))) {
                    throw ApiException.invalidPreference(
                            "sportDisplay." + entry.getKey() + " doit valoir " + SPEED_DISPLAYS + ".");
                }
            }
        }

        JsonNode goal = patch.get("weeklyGoal");
        if (goal != null && !goal.isNull()) {
            requireObjectWithKeys(goal, "weeklyGoal", GOAL_KEYS);
            positiveNumber(goal, "weeklyGoal.distanceM", goal.get("distanceM"), 100, 1_000_000);
            positiveNumber(goal, "weeklyGoal.sessions", goal.get("sessions"), 1, 50);
        }

        JsonNode zones = patch.get("privacyZones");
        if (zones != null && !zones.isNull()) {
            validatePrivacyZones(zones);
        }

        JsonNode physical = patch.get("physical");
        if (physical != null && !physical.isNull()) {
            requireObjectWithKeys(physical, "physical", PHYSICAL_KEYS);
            // Plausibility bounds: they catch a swapped unit (pounds for kilos) and typos,
            // not the atypical user.
            positiveNumber(physical, "physical.weightKg", physical.get("weightKg"), 30, 300);
            positiveNumber(physical, "physical.heightCm", physical.get("heightCm"), 80, 260);

            JsonNode birth = physical.get("birthDate");
            if (birth != null && !birth.isNull()) {
                if (!birth.isTextual()) {
                    throw ApiException.invalidPreference("physical.birthDate doit être une date ISO (YYYY-MM-DD).");
                }
                LocalDate date;
                try {
                    date = LocalDate.parse(birth.asText());
                } catch (DateTimeParseException e) {
                    throw ApiException.invalidPreference("physical.birthDate doit être une date ISO (YYYY-MM-DD).");
                }
                int age = java.time.Period.between(date, LocalDate.now()).getYears();
                if (age < 10 || age > 120) {
                    throw ApiException.invalidPreference("physical.birthDate doit correspondre à un âge entre 10 et 120 ans.");
                }
            }

            JsonNode sex = physical.get("sex");
            if (sex != null && !sex.isNull()
                    && (!sex.isTextual() || !SEXES.contains(sex.asText()))) {
                throw ApiException.invalidPreference("physical.sex doit valoir " + SEXES + ".");
            }
        }
    }

    /**
     * Privacy zones (#37): the list is replaced as a whole, never merged item by item,
     * since an array has no stable key for that.
     */
    private void validatePrivacyZones(JsonNode zones) {
        if (!zones.isArray()) {
            throw ApiException.invalidPreference("privacyZones doit être une liste.");
        }
        if (zones.size() > MAX_PRIVACY_ZONES) {
            throw ApiException.invalidPreference(
                    "privacyZones : " + MAX_PRIVACY_ZONES + " zones au maximum.");
        }
        for (JsonNode zone : zones) {
            requireObjectWithKeys(zone, "privacyZones[]", PRIVACY_ZONE_KEYS);
            for (String required : List.of("lat", "lng", "radiusM")) {
                if (zone.get(required) == null || zone.get(required).isNull()) {
                    throw ApiException.invalidPreference("privacyZones[]." + required + " est requis.");
                }
            }
            positiveNumber(zone, "privacyZones.lat", zone.get("lat"), -90, 90);
            positiveNumber(zone, "privacyZones.lng", zone.get("lng"), -180, 180);
            // Below 100 m, the start stays identifiable down to the street; beyond 2 km, a
            // whole neighbourhood disappears from every track.
            positiveNumber(zone, "privacyZones.radiusM", zone.get("radiusM"), 100, 2000);
            JsonNode label = zone.get("label");
            if (label != null && !label.isNull()
                    && (!label.isTextual() || label.asText().length() > MAX_PRIVACY_ZONE_LABEL)) {
                throw ApiException.invalidPreference(
                        "privacyZones[].label : texte de " + MAX_PRIVACY_ZONE_LABEL + " caractères au plus.");
            }
        }
    }

    private void requireObjectWithKeys(JsonNode node, String path, Set<String> allowed) {
        if (!node.isObject()) {
            throw ApiException.invalidPreference(path + " doit être un objet.");
        }
        Iterator<String> names = node.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!allowed.contains(name)) {
                throw ApiException.invalidPreference("Champ inconnu : " + path + "." + name);
            }
        }
    }

    private void enumField(JsonNode patch, String key, List<String> allowed) {
        JsonNode value = patch.get(key);
        if (value == null || value.isNull()) {
            return;
        }
        if (!value.isTextual() || !allowed.contains(value.asText())) {
            throw ApiException.invalidPreference(key + " doit valoir " + allowed + ".");
        }
    }

    private void booleanField(JsonNode patch, String key) {
        JsonNode value = patch.get(key);
        if (value != null && !value.isNull() && !value.isBoolean()) {
            throw ApiException.invalidPreference(key + " doit être un booléen.");
        }
    }

    private void positiveNumber(JsonNode parent, String path, JsonNode value, double min, double max) {
        if (value == null || value.isNull()) {
            return;
        }
        if (!value.isNumber()) {
            throw ApiException.invalidPreference(path + " doit être un nombre.");
        }
        double d = value.asDouble();
        if (d < min || d > max) {
            throw ApiException.invalidPreference(path + " doit être compris entre " + min + " et " + max + ".");
        }
    }

    /** Extracts the athlete profile in the form expected by sport modules. */
    public AthleteProfile athleteProfile(UserEntity user) {
        if (user == null || user.preferences == null) {
            return AthleteProfile.EMPTY;
        }
        JsonNode physical = user.preferences.get("physical");
        if (physical == null || !physical.isObject()) {
            return AthleteProfile.EMPTY;
        }
        return new AthleteProfile(
                number(physical.get("weightKg")),
                number(physical.get("heightCm")),
                date(physical.get("birthDate")),
                text(physical.get("sex")));
    }

    private Double number(JsonNode node) {
        return node != null && node.isNumber() ? node.asDouble() : null;
    }

    private String text(JsonNode node) {
        return node != null && node.isTextual() ? node.asText() : null;
    }

    private LocalDate date(JsonNode node) {
        if (node == null || !node.isTextual()) {
            return null;
        }
        try {
            return LocalDate.parse(node.asText());
        } catch (DateTimeParseException e) {
            return null; // tolerant read: an unreadable stored value doesn't prevent serving the rest
        }
    }
}
