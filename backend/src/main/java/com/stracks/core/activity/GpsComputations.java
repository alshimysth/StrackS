package com.stracks.core.activity;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * GPS computation engine shared by geolocated sports (running, walking, later cycling/trail).
 * Recomputes everything from the stored raw track_points: raw data stays the source of
 * truth, metrics can be replayed.
 *
 * Filters (see wiki Running-App-Mechanics, 2026-07-13):
 *  - horizontal accuracy: points beyond MAX_ACCURACY_M are dropped;
 *  - plausibility: segments faster than maxSpeedKmh are dropped (GPS noise);
 *  - elevation: smoothed altitude (5-point moving average) + 2 m hysteresis before
 *    accumulating, since raw GPS altitude heavily overestimates the gain.
 */
public final class GpsComputations {

    public static final double MAX_ACCURACY_M = 50.0;

    /**
     * Beyond this gap between two kept points, the signal is considered lost and the
     * segment is NOT counted (#19). Without this rule, going through a tunnel adds the
     * chord between entry and exit: the plausibility filter doesn't catch it (1 km in
     * 5 min = 12 km/h, plausible for a runner), and a straight-line distance gets counted
     * although it was never covered.
     *
     * EXACT MIRROR of metrics.ts SIGNAL_LOST_MS: any change here must be carried over to
     * the client, otherwise the live display diverges from the recomputation at stop
     * (parity locked by #40).
     */
    public static final long SIGNAL_LOST_MS = 15_000L;
    public static final double ELEVATION_HYSTERESIS_M = 2.0;
    private static final int SMOOTHING_WINDOW = 5;
    private static final double EARTH_RADIUS_M = 6_371_000.0;

    public record Result(
            double distanceM,
            double elevationGainM,
            double elevationLossM,
            List<Split> splits) {
    }

    /** Kilometre split: pace in seconds per km. */
    public record Split(int km, int paceSecPerKm) {
    }

    private GpsComputations() {
    }

    public static Result compute(List<TrackPointEntity> track, double maxSpeedKmh) {
        List<TrackPointEntity> usable = filter(track, maxSpeedKmh);

        double distance = 0;
        List<Split> splits = new ArrayList<>();
        double nextSplitAt = 1000;
        long splitStartMs = usable.isEmpty() ? 0 : usable.get(0).recordedAt.toEpochMilli();

        for (int i = 1; i < usable.size(); i++) {
            TrackPointEntity a = usable.get(i - 1);
            TrackPointEntity b = usable.get(i);
            long gapMs = b.recordedAt.toEpochMilli() - a.recordedAt.toEpochMilli();
            // Gap too long: the point reopens the track but the segment isn't counted,
            // since we don't know which path was taken in between.
            if (gapMs < SIGNAL_LOST_MS) {
                distance += haversineM(a.lat, a.lng, b.lat, b.lng);
            }

            if (distance >= nextSplitAt) {
                long elapsedMs = b.recordedAt.toEpochMilli() - splitStartMs;
                splits.add(new Split((int) (nextSplitAt / 1000), (int) (elapsedMs / 1000)));
                splitStartMs = b.recordedAt.toEpochMilli();
                nextSplitAt += 1000;
            }
        }

        double[] elevation = elevationGainLoss(usable);
        return new Result(distance, elevation[0], elevation[1], splits);
    }

    /** Haversine distance in metres between two coordinates. */
    public static double haversineM(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
    }

    private static List<TrackPointEntity> filter(List<TrackPointEntity> track, double maxSpeedKmh) {
        double maxSpeedMs = maxSpeedKmh / 3.6;
        List<TrackPointEntity> out = new ArrayList<>(track.size());
        TrackPointEntity previous = null;
        for (TrackPointEntity p : track) {
            if (p.accuracyM != null && p.accuracyM > MAX_ACCURACY_M) {
                continue;
            }
            if (previous != null) {
                double seconds = Duration.between(previous.recordedAt, p.recordedAt).toMillis() / 1000.0;
                if (seconds <= 0) {
                    continue;
                }
                double speed = haversineM(previous.lat, previous.lng, p.lat, p.lng) / seconds;
                if (speed > maxSpeedMs) {
                    continue;
                }
            }
            out.add(p);
            previous = p;
        }
        return out;
    }

    private static double[] elevationGainLoss(List<TrackPointEntity> track) {
        List<Double> altitudes = new ArrayList<>();
        for (TrackPointEntity p : track) {
            if (p.altitudeM != null) {
                altitudes.add(p.altitudeM);
            }
        }
        if (altitudes.size() < 2) {
            return new double[] { 0, 0 };
        }

        // Moving average centred on SMOOTHING_WINDOW points
        List<Double> smoothed = new ArrayList<>(altitudes.size());
        int half = SMOOTHING_WINDOW / 2;
        for (int i = 0; i < altitudes.size(); i++) {
            int from = Math.max(0, i - half);
            int to = Math.min(altitudes.size() - 1, i + half);
            double sum = 0;
            for (int j = from; j <= to; j++) {
                sum += altitudes.get(j);
            }
            smoothed.add(sum / (to - from + 1));
        }

        // Hysteresis: only accumulate a change confirmed beyond the threshold
        double gain = 0;
        double loss = 0;
        double reference = smoothed.get(0);
        for (double alt : smoothed) {
            double delta = alt - reference;
            if (delta >= ELEVATION_HYSTERESIS_M) {
                gain += delta;
                reference = alt;
            } else if (delta <= -ELEVATION_HYSTERESIS_M) {
                loss += -delta;
                reference = alt;
            }
        }
        return new double[] { gain, loss };
    }

    /**
     * Totals of a batch of GPS activities, under the keys expected by {@link SportStats}.
     *
     * <p><strong>A tool, not a contract.</strong> The core never calls it on its own: the
     * plugin of a geolocated sport chooses to use it, exactly as it chooses
     * {@link #compute}. A sport without GPS never sees it and therefore declares neither
     * distance nor elevation, which is the whole point.
     *
     * <p>Both keys are always present, even at zero: here the sport declares what it
     * <em>can measure</em>, not what it measured this week. Otherwise a week without
     * elevation would make the "D+" row disappear from the screen.
     */
    public static Map<String, Double> gpsTotals(List<ActivityEntity> activities) {
        double distanceM = 0;
        double elevationGainM = 0;
        for (ActivityEntity a : activities) {
            if (a.distanceM != null) {
                distanceM += a.distanceM.doubleValue();
            }
            if (a.metrics != null && a.metrics.hasNonNull("elevationGainM")) {
                elevationGainM += a.metrics.get("elevationGainM").asDouble();
            }
        }
        Map<String, Double> totals = new LinkedHashMap<>();
        totals.put("distanceM", distanceM);
        totals.put("elevationGainM", elevationGainM);
        return totals;
    }
}
