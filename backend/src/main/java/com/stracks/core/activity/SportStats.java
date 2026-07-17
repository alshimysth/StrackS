package com.stracks.core.activity;

public record SportStats(
        String sportType,
        String label,
        int sessions,
        long totalDurationS,
        double totalDistanceM,
        double totalElevationGainM) {
}
