package com.stracks.core.activity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Tests unitaires du moteur GPS partagé (sans Quarkus). */
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
            // ~11,1 m par pas de latitude 0.0001 → ~1,1 km au total
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
        // Point aberrant : 500 m de saut avec précision pourrie
        track.add(point(1, t0.plusSeconds(6), 45.005, 5.0, 200.0, 120.0));
        track.add(point(2, t0.plusSeconds(12), 45.0002, 5.0, 200.0, 5.0));
        double d = GpsComputations.compute(track, 25.0).distanceM();
        assertTrue(d < 50, "le point imprécis doit être écarté, distance=" + d);
    }

    @Test
    void implausible_speed_segments_are_dropped() {
        Instant t0 = Instant.now();
        List<TrackPointEntity> track = new ArrayList<>();
        track.add(point(0, t0, 45.0, 5.0, 200.0, 5.0));
        // 1 km en 6 s = 600 km/h : impossible en courant
        track.add(point(1, t0.plusSeconds(6), 45.009, 5.0, 200.0, 5.0));
        track.add(point(2, t0.plusSeconds(12), 45.0001, 5.0, 200.0, 5.0));
        double d = GpsComputations.compute(track, 25.0).distanceM();
        assertTrue(d < 50, "le segment implausible doit être écarté, distance=" + d);
    }

    @Test
    void elevation_hysteresis_ignores_gps_noise() {
        Instant t0 = Instant.now();
        List<TrackPointEntity> noisy = new ArrayList<>();
        for (int i = 0; i < 60; i++) {
            // Oscillation ±0,8 m autour de 200 m : que du bruit, D+ attendu ≈ 0
            double alt = 200.0 + (i % 2 == 0 ? 0.8 : -0.8);
            noisy.add(point(i, t0.plusSeconds(i * 6L), 45.0 + i * 0.0001, 5.0, alt, 5.0));
        }
        assertEquals(0.0, GpsComputations.compute(noisy, 25.0).elevationGainM(), 0.01);

        List<TrackPointEntity> climb = new ArrayList<>();
        for (int i = 0; i < 60; i++) {
            // Vraie montée régulière de 30 m
            climb.add(point(i, t0.plusSeconds(i * 6L), 45.0 + i * 0.0001, 5.0, 200.0 + i * 0.5, 5.0));
        }
        double gain = GpsComputations.compute(climb, 25.0).elevationGainM();
        assertTrue(gain > 24 && gain <= 30, "gain=" + gain);
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
