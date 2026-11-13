package com.stracks.core.activity.domain;

import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stracks.core.common.ApiException;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The validator every plugin leans on: one wording, one set of rules (no Quarkus). */
class MetricsSchemaTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final MetricsSchema MATCH = MetricsSchema.object()
            .enumeration("format", "singles", "doubles")
            .array("sets", MetricsSchema.object()
                    .integer("won", 0, 7)
                    .integer("lost", 0, 7)
                    .required("won", "lost"), 5)
            .pattern("venue", Pattern.compile("^[A-Z]{3}$"), "un code de trois lettres")
            .number("temperatureC", -30, 50)
            .computed("result");

    private static JsonNode json(String text) throws Exception {
        return MAPPER.readTree(text);
    }

    private static String detail(Executable executable) {
        ApiException e = assertThrows(ApiException.class, executable::run);
        assertEquals(422, e.status());
        return e.getMessage();
    }

    @FunctionalInterface
    private interface Executable {
        void run() throws Exception;
    }

    @Test
    void accepts_a_valid_document_and_the_computed_keys() throws Exception {
        JsonNode node = json("""
                {"schemaVersion":1,"format":"doubles","sets":[{"won":6,"lost":4}],"result":"win"}""");
        assertDoesNotThrow(() -> MATCH.validate(node));
    }

    @Test
    void every_declared_field_is_optional_unless_required() throws Exception {
        assertDoesNotThrow(() -> MATCH.validate(json("{}")));
        assertDoesNotThrow(() -> MATCH.validate(json("{\"format\":null}")));
    }

    @Test
    void rejects_an_unknown_key_by_name() throws Exception {
        String detail = detail(() -> MATCH.validate(json("{\"formatt\":\"singles\"}")));
        assertTrue(detail.contains("formatt"), detail);
    }

    @Test
    void rejects_a_value_outside_the_enumeration() throws Exception {
        String detail = detail(() -> MATCH.validate(json("{\"format\":\"triples\"}")));
        assertTrue(detail.contains("metrics.format"), detail);
        assertTrue(detail.contains("singles"), detail);
    }

    @Test
    void reports_the_path_of_a_bad_array_item() throws Exception {
        String detail = detail(() -> MATCH.validate(json("{\"sets\":[{\"won\":6,\"lost\":4},{\"won\":9,\"lost\":1}]}")));
        assertTrue(detail.contains("metrics.sets[1].won"), detail);
    }

    @Test
    void enforces_required_keys_inside_items() throws Exception {
        String detail = detail(() -> MATCH.validate(json("{\"sets\":[{\"won\":6}]}")));
        assertTrue(detail.contains("metrics.sets[0].lost"), detail);
        assertTrue(detail.contains("obligatoire"), detail);
    }

    @Test
    void caps_the_number_of_items() throws Exception {
        String detail = detail(() -> MATCH.validate(json(
                "{\"sets\":[{\"won\":1,\"lost\":0},{\"won\":1,\"lost\":0},{\"won\":1,\"lost\":0},"
                        + "{\"won\":1,\"lost\":0},{\"won\":1,\"lost\":0},{\"won\":1,\"lost\":0}]}")));
        assertTrue(detail.contains("5"), detail);
    }

    @Test
    void integers_reject_decimals_and_numbers_reject_text() throws Exception {
        assertTrue(detail(() -> MATCH.validate(json("{\"sets\":[{\"won\":6.5,\"lost\":4}]}"))).contains("entier"));
        assertTrue(detail(() -> MATCH.validate(json("{\"temperatureC\":\"chaud\"}"))).contains("nombre"));
        assertTrue(detail(() -> MATCH.validate(json("{\"temperatureC\":80}"))).contains("-30"));
    }

    /** A BigInteger past the long range narrows silently with asLong() (PR #101 review). */
    @Test
    void integers_beyond_the_int_range_are_refused_rather_than_narrowed() throws Exception {
        assertTrue(detail(() -> MATCH.validate(json("{\"sets\":[{\"won\":18446744073709551617,\"lost\":4}]}")))
                .contains("metrics.sets[0].won"));
        assertTrue(detail(() -> MATCH.validate(json("{\"sets\":[{\"won\":3000000000,\"lost\":4}]}")))
                .contains("entre 0 et 7"));
    }

    @Test
    void text_predicates_validate_with_the_parser_the_plugin_will_use() throws Exception {
        MetricsSchema schema = MetricsSchema.object().text("grade", g -> g.equals("6a"), "une cotation");
        assertDoesNotThrow(() -> schema.validate(json("{\"grade\":\"6a\"}")));
        assertTrue(detail(() -> schema.validate(json("{\"grade\":\"6\"}"))).contains("une cotation"));
    }

    @Test
    void patterns_explain_what_a_valid_value_looks_like() throws Exception {
        String detail = detail(() -> MATCH.validate(json("{\"venue\":\"paris\"}")));
        assertTrue(detail.contains("trois lettres"), detail);
    }

    @Test
    void the_document_itself_must_be_an_object() throws Exception {
        assertTrue(detail(() -> MATCH.validate(json("[]"))).contains("objet"));
        assertTrue(detail(() -> MATCH.validate(null)).contains("objet"));
        assertTrue(detail(() -> MATCH.validate(json("{\"schemaVersion\":\"one\"}"))).contains("schemaVersion"));
    }

    @Test
    void a_required_key_must_be_declared_first() {
        assertThrows(IllegalStateException.class, () -> MetricsSchema.object().required("ghost"));
    }
}
