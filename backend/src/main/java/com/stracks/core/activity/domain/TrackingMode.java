package com.stracks.core.activity.domain;

/**
 * How a session of a sport is recorded. The core only needs to know this much: whether a
 * track exists (and must be uploaded before the stop) or whether the session is a timer
 * whose content the client reports in {@code metrics}.
 */
public enum TrackingMode {
    /** Geolocated: GPS track uploaded in batches, metrics recomputed by the server. */
    GPS,
    /** Timed: no track, the client reports what happened (routes, sets, distance read on a machine). */
    TIMER;

    public boolean usesGps() {
        return this == GPS;
    }
}
