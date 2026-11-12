package com.stracks.sports.climbing;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Grade parsing and ordering (no Quarkus). The ordinal formula is mirrored by the mobile
 * climbing module: a change here must be carried over to {@code grades.ts}.
 */
class FrenchGradeTest {

    @Test
    void parses_route_grades_in_the_modern_notation() {
        FrenchGrade g = FrenchGrade.parseRoute("6a+").orElseThrow();
        assertEquals(6, g.number());
        assertEquals(1, g.letter());
        assertTrue(g.plus());
        assertEquals("6a+", g.routeLabel());
    }

    @Test
    void parses_fontainebleau_boulder_grades_including_the_letterless_ones() {
        assertEquals("7B+", FrenchGrade.parseBoulder("7B+").orElseThrow().boulderLabel());
        assertEquals("5+", FrenchGrade.parseBoulder("5+").orElseThrow().boulderLabel());
        assertEquals("4", FrenchGrade.parseBoulder("4").orElseThrow().boulderLabel());
    }

    @Test
    void refuses_what_isnt_a_grade() {
        assertTrue(FrenchGrade.parseRoute("6").isEmpty(), "6 alone means nothing from 6 upwards");
        assertTrue(FrenchGrade.parseRoute("6A").isEmpty(), "uppercase is the boulder notation");
        assertTrue(FrenchGrade.parseRoute("5+").isEmpty(), "routes carry a letter");
        assertTrue(FrenchGrade.parseRoute("V5").isEmpty(), "Hueco isn't supported");
        assertTrue(FrenchGrade.parseRoute("").isEmpty());
        assertTrue(FrenchGrade.parseRoute(null).isEmpty());
        assertTrue(FrenchGrade.parseBoulder("6a").isEmpty(), "lowercase is the route notation");
    }

    @Test
    void orders_grades_as_climbers_do() {
        List<String> ascending = List.of("5c", "6a", "6a+", "6b", "6b+", "6c", "6c+", "7a", "7a+", "8a");
        for (int i = 1; i < ascending.size(); i++) {
            FrenchGrade lower = FrenchGrade.parseRoute(ascending.get(i - 1)).orElseThrow();
            FrenchGrade higher = FrenchGrade.parseRoute(ascending.get(i)).orElseThrow();
            assertTrue(lower.compareTo(higher) < 0, ascending.get(i - 1) + " < " + ascending.get(i));
            assertTrue(lower.ordinal() < higher.ordinal());
        }
        // The letterless boulder grades sit below the lettered ones of the same number.
        assertTrue(FrenchGrade.parseBoulder("5+").orElseThrow().compareTo(FrenchGrade.parseBoulder("6A").orElseThrow()) < 0);
        assertTrue(FrenchGrade.parseBoulder("5").orElseThrow().compareTo(FrenchGrade.parseBoulder("5+").orElseThrow()) < 0);
    }

    @Test
    void the_ordinal_formula_is_the_one_the_client_mirrors() {
        // number * 10 + letter * 2 + plus
        assertEquals(60, FrenchGrade.parseRoute("6a").orElseThrow().ordinal() - 2);
        assertEquals(63, FrenchGrade.parseRoute("6a+").orElseThrow().ordinal());
        assertEquals(66, FrenchGrade.parseBoulder("6C").orElseThrow().ordinal());
        assertEquals(51, FrenchGrade.parseBoulder("5+").orElseThrow().ordinal());
    }
}
