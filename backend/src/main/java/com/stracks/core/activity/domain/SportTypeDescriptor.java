package com.stracks.core.activity.domain;

/**
 * Identity card of a sport. Exposed by {@code GET /sport-types} through a transport DTO:
 * the domain carries no serialisation concern.
 *
 * @param code          stable identifier stored in {@code activities.sport_type}
 * @param label         label displayed as is by the client
 * @param family        grouping shown by the client (sport picker, filters)
 * @param trackingMode  GPS track or plain timer
 * @param schemaVersion version of the {@code metrics} JSONB written by this plugin
 */
public record SportTypeDescriptor(
        String code,
        String label,
        SportFamily family,
        TrackingMode trackingMode,
        int schemaVersion) {

    public SportTypeDescriptor {
        if (code == null || !code.matches("[a-z][a-z0-9_]*")) {
            throw new IllegalArgumentException("Sport code must be snake_case: " + code);
        }
        if (family == null || trackingMode == null) {
            throw new IllegalArgumentException("A sport needs a family and a tracking mode: " + code);
        }
    }

    public boolean usesGps() {
        return trackingMode.usesGps();
    }
}
