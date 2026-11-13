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
 * Road cycling. Metrics schema v1:
 * { schemaVersion, avgSpeedKmh, maxSpeedKmh, elevationGainM, elevationLossM }
 */
@ApplicationScoped
public class RoadCyclingPlugin extends GpsSportPlugin {

    static final int SCHEMA_VERSION = 1;
    /** A long descent reaches 80 km/h; beyond this it's noise. Mirrored by the mobile module. */
    static final double MAX_SPEED_KMH = 80.0;

    @Override
    public SportTypeDescriptor descriptor() {
        return new SportTypeDescriptor("cycling", "Vélo route", CyclingFamily.FAMILY, TrackingMode.GPS, SCHEMA_VERSION);
    }

    @Override
    public double maxGpsSpeedKmh() {
        return MAX_SPEED_KMH;
    }

    @Override
    protected double met(double speedKmh) {
        return CyclingFamily.met(speedKmh);
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
