package com.stracks.sports.cycling;

import java.util.List;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stracks.core.activity.domain.ActivityEntity;
import com.stracks.core.activity.domain.GpsComputations;
import com.stracks.core.activity.domain.GpsSportPlugin;
import com.stracks.core.activity.domain.MetricsSchema;
import com.stracks.core.activity.domain.PersonalRecordMetric;
import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.activity.domain.TrackingMode;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Mountain biking. Same metrics as road cycling; what differs is the effort model: a slow
 * technical climb costs far more than the same speed on tarmac, so the MET has a floor.
 */
@ApplicationScoped
public class MountainBikingPlugin extends GpsSportPlugin {

    static final int SCHEMA_VERSION = 1;
    /** Trails are slower than roads; beyond this it's noise. Mirrored by the mobile module. */
    static final double MAX_SPEED_KMH = 70.0;
    /** Compendium 01009, mountain biking general. */
    private static final double MIN_MET = 8.5;

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("mountain_biking", "VTT", CyclingFamily.FAMILY, TrackingMode.GPS, SCHEMA_VERSION);
    }

    @Override
    public double maxGpsSpeedKmh() {
        return MAX_SPEED_KMH;
    }

    @Override
    protected double met(double speedKmh) {
        return Math.max(MIN_MET, CyclingFamily.met(speedKmh));
    }

    @Override
    protected MetricsSchema schema() {
        return CyclingFamily.outdoorSchema(super.schema());
    }

    @Override
    protected void addSportMetrics(ObjectNode metrics, ActivityEntity activity, GpsComputations.Result r) {
        CyclingFamily.addOutdoorMetrics(metrics, activity, r);
    }

    @Override
    protected List<PersonalRecordMetric> extraRecords() {
        return CyclingFamily.outdoorRecords();
    }
}
