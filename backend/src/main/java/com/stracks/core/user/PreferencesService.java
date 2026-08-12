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
 * Schéma des préférences utilisateur : valeurs par défaut, validation et fusion.
 *
 * <p><b>Asymétrie volontaire entre lecture et écriture.</b> En lecture on est
 * tolérant : une clé inconnue stockée est conservée telle quelle et ignorée, une
 * clé absente prend son défaut — un client ancien et un client récent cohabitent
 * sans que rien ne casse. En écriture on est strict : une clé inconnue est
 * refusée en 422, parce qu'accepter silencieusement une faute de frappe
 * fabriquerait une préférence qui ne sera jamais lue.
 *
 * <p>Le document complet vit dans une seule colonne JSONB — ajouter une
 * préférence ne demande aucune migration.
 */
@ApplicationScoped
public class PreferencesService {

    private static final JsonNodeFactory json = JsonNodeFactory.instance;

    /** Clés racine connues. Toute autre clé est refusée à l'écriture. */
    private static final Set<String> ROOT_KEYS = Set.of(
            "units", "theme", "defaultSport", "sportDisplay", "gpsMode",
            "countdownEnabled", "autoPauseEnabled", "weeklyGoal", "physical");

    private static final Set<String> PHYSICAL_KEYS = Set.of("weightKg", "heightCm", "birthDate", "sex");
    private static final Set<String> GOAL_KEYS = Set.of("distanceM", "sessions");

    private static final List<String> UNITS = List.of("metric", "imperial");
    private static final List<String> THEMES = List.of("auto", "light", "dark");
    private static final List<String> GPS_MODES = List.of("max", "balanced", "saver");
    private static final List<String> SPEED_DISPLAYS = List.of("pace", "speed");
    private static final List<String> SEXES = List.of("female", "male", "unspecified");

    @Inject
    SportRegistry registry;

    /**
     * Document complet renvoyé au client : les défauts, écrasés par ce qui est
     * stocké. Les clés inconnues éventuellement présentes en base sont recopiées
     * telles quelles — on ne détruit jamais une préférence qu'on ne comprend pas.
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
        // Hors PRD v2.0 — désactivée tant que la décision produit n'est pas prise (#20)
        root.put("autoPauseEnabled", false);

        ObjectNode goal = root.putObject("weeklyGoal");
        goal.putNull("distanceM");
        goal.putNull("sessions");

        ObjectNode physical = root.putObject("physical");
        physical.putNull("weightKg");
        physical.putNull("heightCm");
        physical.putNull("birthDate");
        physical.putNull("sex");
        return root;
    }

    /**
     * Valide un patch puis le fusionne dans le document stocké. Une valeur
     * {@code null} remet la préférence à son défaut (la clé est retirée du
     * stockage plutôt que forcée à null).
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
            registry.require(sport.asText()); // 422 si le sport n'est pas au registre
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

        JsonNode physical = patch.get("physical");
        if (physical != null && !physical.isNull()) {
            requireObjectWithKeys(physical, "physical", PHYSICAL_KEYS);
            // Bornes de plausibilité : elles attrapent l'unité inversée (livres
            // pour des kilos) et la faute de frappe, pas l'utilisateur atypique.
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

    /** Extrait le profil physique sous la forme attendue par les modules de sport. */
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
            return null; // lecture tolérante : une valeur illisible en base n'empêche pas de servir le reste
        }
    }
}
