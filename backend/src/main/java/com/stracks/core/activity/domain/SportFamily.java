package com.stracks.core.activity.domain;

/**
 * Grouping of sports as the user sees it ("Course à pied" gathers road running, trail and
 * treadmill). A value declared by the plugins, never an enumeration held by the core: an
 * enum would force a change to {@code core/} for every new family, which the plugin
 * pattern forbids.
 *
 * @param code  stable identifier, snake_case, exchanged with the client
 * @param label label displayed as is by the client
 */
public record SportFamily(String code, String label) {

    public SportFamily {
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("A sport family needs a code.");
        }
        if (label == null || label.isBlank()) {
            throw new IllegalArgumentException("A sport family needs a label.");
        }
    }
}
