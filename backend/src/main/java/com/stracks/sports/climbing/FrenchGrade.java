package com.stracks.sports.climbing;

import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A climbing grade in the French systems, comparable.
 *
 * <p>Two scales share one shape, "number, optional letter, optional plus":
 * <ul>
 *   <li>routes: lowercase letter, {@code 6a}, {@code 6a+}, {@code 7c}, letter mandatory from 6;</li>
 *   <li>boulders (Fontainebleau): uppercase letter, {@code 6A}, {@code 6A+}, {@code 7C}, and
 *       {@code 4}, {@code 5}, {@code 5+} below 6 where the letter doesn't exist.</li>
 * </ul>
 *
 * <p>The value object carries an <strong>ordinal</strong>: {@code 6a} &lt; {@code 6a+} &lt;
 * {@code 6b}. It's what lets the server name the hardest send and keep a record for it; the
 * client's module turns the ordinal back into a label with the same table.
 *
 * <p>The mobile module mirrors this parser ({@code sports/climbing/grades.ts}): a grade the
 * server accepts must be one the client can display.
 */
public record FrenchGrade(int number, int letter, boolean plus) implements Comparable<FrenchGrade> {

    /** "6a", "6a+", "5c" or "4" (routes below 5 may omit the letter in some guides). */
    private static final Pattern ROUTE = Pattern.compile("^([3-9])([abc])?(\\+)?$");
    /** "6A", "6A+", "7C" or "4", "5", "5+". */
    private static final Pattern BOULDER = Pattern.compile("^([3-9])([ABC])?(\\+)?$");

    /** Letter weight: a < b < c; 0 when the grade has no letter. */
    private static final String LETTERS = "abc";

    public static Optional<FrenchGrade> parseRoute(String text) {
        return parse(text, ROUTE, false);
    }

    public static Optional<FrenchGrade> parseBoulder(String text) {
        return parse(text, BOULDER, true);
    }

    private static Optional<FrenchGrade> parse(String text, Pattern pattern, boolean boulder) {
        if (text == null) {
            return Optional.empty();
        }
        Matcher m = pattern.matcher(text.trim());
        if (!m.matches()) {
            return Optional.empty();
        }
        int number = Integer.parseInt(m.group(1));
        String letter = m.group(2);
        boolean plus = m.group(3) != null;
        // From 6 upwards the letter is part of the grade: "6" alone means nothing.
        if (letter == null && number >= 6) {
            return Optional.empty();
        }
        // Routes always carry a letter in the modern system; "5+" is a boulder notation.
        if (!boulder && letter == null && plus) {
            return Optional.empty();
        }
        int letterIndex = letter == null ? 0 : LETTERS.indexOf(letter.toLowerCase(Locale.ROOT)) + 1;
        return Optional.of(new FrenchGrade(number, letterIndex, plus));
    }

    /**
     * Position on the scale: 10 steps per number (3 letters × 2 for the plus, with room
     * for the letterless grades below 6). Same formula on the client.
     */
    public int ordinal() {
        return number * 10 + letter * 2 + (plus ? 1 : 0);
    }

    /** Label in the route notation ("6a+"). */
    public String routeLabel() {
        return number + (letter == 0 ? "" : String.valueOf(LETTERS.charAt(letter - 1))) + (plus ? "+" : "");
    }

    /** Label in the Fontainebleau notation ("6A+"). */
    public String boulderLabel() {
        return routeLabel().toUpperCase(Locale.ROOT);
    }

    @Override
    public int compareTo(FrenchGrade other) {
        return Integer.compare(ordinal(), other.ordinal());
    }
}
