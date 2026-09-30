package com.stracks.core.activity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Unit tests of the shared GPS engine (no Quarkus). */
class GpsComputationsTest {

    private static TrackPointEntity point(int seq, Instant t, double lat, double lng,
            Double alt, Double accuracy) {
        TrackPointEntity p = new TrackPointEntity();
        p.seq = seq;
        p.recordedAt = t;
        p.lat = lat;
        p.lng = lng;
        p.altitudeM = alt;
        p.accuracyM = accuracy;
        return p;
    }

    @Test
    void haversine_paris_to_lyon_is_about_392km() {
        double d = GpsComputations.haversineM(48.8566, 2.3522, 45.7640, 4.8357);
        assertTrue(d > 380_000 && d < 400_000, "distance=" + d);
    }

    @Test
    void distance_accumulates_on_clean_track() {
        Instant t0 = Instant.now();
        List<TrackPointEntity> track = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            // ~11.1 m per 0.0001 latitude step → ~1.1 km in total
            track.add(point(i, t0.plusSeconds(i * 6L), 45.0 + i * 0.0001, 5.0, 200.0, 5.0));
        }
        double d = GpsComputations.compute(track, 25.0).distanceM();
        assertTrue(d > 1050 && d < 1150, "distance=" + d);
    }

    @Test
    void poor_accuracy_points_are_dropped() {
        Instant t0 = Instant.now();
        List<TrackPointEntity> track = new ArrayList<>();
        track.add(point(0, t0, 45.0, 5.0, 200.0, 5.0));
        // Outlier: a 500 m jump with lousy accuracy
        track.add(point(1, t0.plusSeconds(6), 45.005, 5.0, 200.0, 120.0));
        track.add(point(2, t0.plusSeconds(12), 45.0002, 5.0, 200.0, 5.0));
        double d = GpsComputations.compute(track, 25.0).distanceM();
        assertTrue(d < 50, "the inaccurate point must be dropped, distance=" + d);
    }

    @Test
    void implausible_speed_segments_are_dropped() {
        Instant t0 = Instant.now();
        List<TrackPointEntity> track = new ArrayList<>();
        track.add(point(0, t0, 45.0, 5.0, 200.0, 5.0));
        // 1 km in 6 s = 600 km/h: impossible on foot
        track.add(point(1, t0.plusSeconds(6), 45.009, 5.0, 200.0, 5.0));
        track.add(point(2, t0.plusSeconds(12), 45.0001, 5.0, 200.0, 5.0));
        double d = GpsComputations.compute(track, 25.0).distanceM();
        assertTrue(d < 50, "the implausible segment must be dropped, distance=" + d);
    }

    @Test
    void elevation_hysteresis_ignores_gps_noise() {
        Instant t0 = Instant.now();
        List<TrackPointEntity> noisy = new ArrayList<>();
        for (int i = 0; i < 60; i++) {
            // ±0.8 m oscillation around 200 m: pure noise, expected gain ≈ 0
            double alt = 200.0 + (i % 2 == 0 ? 0.8 : -0.8);
            noisy.add(point(i, t0.plusSeconds(i * 6L), 45.0 + i * 0.0001, 5.0, alt, 5.0));
        }
        assertEquals(0.0, GpsComputations.compute(noisy, 25.0).elevationGainM(), 0.01);

        List<TrackPointEntity> climb = new ArrayList<>();
        for (int i = 0; i < 60; i++) {
            // Real steady 30 m climb
            climb.add(point(i, t0.plusSeconds(i * 6L), 45.0 + i * 0.0001, 5.0, 200.0 + i * 0.5, 5.0));
        }
        double gain = GpsComputations.compute(climb, 25.0).elevationGainM();
        assertTrue(gain > 24 && gain <= 30, "gain=" + gain);
    }

    /**
     * Exact mirror of the client test `signal-loss.test.ts` (#19). The plausibility filter
     * isn't enough: 1.1 km covered in 5 minutes of tunnel gives 13 km/h, plausible for a
     * runner. Without the gap rule, this never-travelled chord would be counted.
     */
    @Test
    void segment_spanning_a_signal_gap_is_not_counted() {
        Instant t0 = Instant.now();
        List<TrackPointEntity> track = new ArrayList<>();
        track.add(point(0, t0, 45.0, 5.0, 200.0, 5.0));
        track.add(point(1, t0.plusSeconds(300), 45.01, 5.0, 200.0, 5.0));

        assertEquals(0.0, GpsComputations.compute(track, 25.0).distanceM(), 0.001);
    }

    @Test
    void segment_below_the_gap_threshold_is_counted() {
        Instant t0 = Instant.now();
        List<TrackPointEntity> track = new ArrayList<>();
        track.add(point(0, t0, 45.0, 5.0, 200.0, 5.0));
        // 14 s: under the 15 s threshold, and ~55 m give 14 km/h, plausible.
        track.add(point(1, t0.plusSeconds(14), 45.0005, 5.0, 200.0, 5.0));

        assertTrue(GpsComputations.compute(track, 25.0).distanceM() > 50);
    }

    /** The gap doesn't poison what follows: counting resumes normally afterwards. */
    @Test
    void counting_resumes_after_the_gap() {
        Instant t0 = Instant.now();
        List<TrackPointEntity> track = new ArrayList<>();
        track.add(point(0, t0, 45.0, 5.0, 200.0, 5.0));
        track.add(point(1, t0.plusSeconds(300), 45.01, 5.0, 200.0, 5.0));
        track.add(point(2, t0.plusSeconds(314), 45.0105, 5.0, 200.0, 5.0));

        double d = GpsComputations.compute(track, 25.0).distanceM();
        assertTrue(d > 50 && d < 100, "distance=" + d);
    }

    @Test
    void splits_every_km() {
        Instant t0 = Instant.now();
        List<TrackPointEntity> track = new ArrayList<>();
        for (int i = 0; i < 200; i++) {
            track.add(point(i, t0.plusSeconds(i * 6L), 45.0 + i * 0.0001, 5.0, 200.0, 5.0));
        }
        List<GpsComputations.Split> splits = GpsComputations.compute(track, 25.0).splits();
        assertEquals(2, splits.size());
        assertEquals(1, splits.get(0).km());
        assertTrue(splits.get(0).paceSecPerKm() > 0);
    }
}
