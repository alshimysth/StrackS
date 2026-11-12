package com.stracks.core.activity.api;

import com.stracks.core.activity.domain.SportFamily;
import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

/** Transport shape of the sport catalogue. */
public final class SportTypeDtos {

    private SportTypeDtos() {
    }

    /**
     * @param usesGps kept for the clients that only ask "is there a track?"; equivalent to
     *                {@code trackingMode == GPS}
     */
    public record SportTypeResponse(
            String code,
            String label,
            SportFamily family,
            TrackingMode trackingMode,
            boolean usesGps,
            int schemaVersion) {

        public static SportTypeResponse of(SportTypeDescriptor d) {
            return new SportTypeResponse(d.code(), d.label(), d.family(), d.trackingMode(), d.usesGps(),
                    d.schemaVersion());
        }
    }
}
