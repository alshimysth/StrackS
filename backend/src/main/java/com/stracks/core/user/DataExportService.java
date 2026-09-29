package com.stracks.core.user;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stracks.core.activity.ActivityDtos.ActivityResponse;
import com.stracks.core.activity.ActivityEntity;
import com.stracks.core.activity.TrackPointEntity;
import com.stracks.core.common.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

/**
 * Personal data export (#76, GDPR art. 20, right to data portability).
 *
 * <p><b>What goes out</b>: profile, preferences, every activity with its metrics and GPS
 * track, in exactly the shapes of the public API, so an export reads with the same
 * documentation. <b>What doesn't</b>: the password hash, session tokens, one-time codes.
 * Those are authentication secrets, not data provided by the user.
 *
 * <p><b>Memory.</b> The document is serialized activity by activity, and the persistence
 * context is cleared after each one: entities don't pile up. The final JSON, however, is
 * held in memory (several tens of MB for hundreds of long sessions). Streaming it would
 * mean reading the database after the request ends, outside the transaction; that's a
 * possible evolution if volumes require it.
 */
@ApplicationScoped
public class DataExportService {

    /** Export format version, independent from the API version. */
    static final int FORMAT_VERSION = 1;

    @Inject
    ObjectMapper mapper;

    @Inject
    EntityManager em;

    @Inject
    PreferencesService preferences;

    @Transactional
    public byte[] export(UUID userId) {
        UserEntity user = UserEntity.findById(userId);
        if (user == null) {
            throw ApiException.notFound("Utilisateur");
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (JsonGenerator json = mapper.getFactory().createGenerator(out)) {
            json.useDefaultPrettyPrinter();
            json.writeStartObject();
            json.writeNumberField("formatVersion", FORMAT_VERSION);
            json.writeStringField("exportedAt", Instant.now().toString());
            json.writeFieldName("user");
            mapper.writeValue(json, UserResponse.of(user));
            json.writeFieldName("preferences");
            mapper.writeValue(json, preferences.withDefaults(user.preferences));

            // Anti-IDOR: the query is bounded to the JWT subject, never to a parameter.
            List<UUID> activityIds = em.createQuery(
                    "select a.id from ActivityEntity a where a.userId = ?1 order by a.startedAt", UUID.class)
                    .setParameter(1, userId)
                    .getResultList();

            json.writeArrayFieldStart("activities");
            for (UUID id : activityIds) {
                ActivityEntity activity = ActivityEntity.findById(id);
                json.writeStartObject();
                json.writeFieldName("activity");
                mapper.writeValue(json, ActivityResponse.of(activity));
                json.writeArrayFieldStart("trackPoints");
                for (TrackPointEntity p : TrackPointEntity.findByActivity(id)) {
                    json.writeStartObject();
                    json.writeNumberField("seq", p.seq);
                    json.writeStringField("recordedAt", p.recordedAt.toString());
                    json.writeNumberField("lat", p.lat);
                    json.writeNumberField("lng", p.lng);
                    writeNullable(json, "altitudeM", p.altitudeM);
                    writeNullable(json, "accuracyM", p.accuracyM);
                    json.writeEndObject();
                }
                json.writeEndArray();
                json.writeEndObject();
                em.clear(); // one activity at a time in the persistence context
            }
            json.writeEndArray();
            json.writeEndObject();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    private static void writeNullable(JsonGenerator json, String field, Double value) throws IOException {
        if (value == null) {
            json.writeNullField(field);
        } else {
            json.writeNumberField(field, value);
        }
    }
}
