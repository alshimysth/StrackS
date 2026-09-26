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
 * Export des données personnelles (#76, RGPD art. 20 — droit à la portabilité).
 *
 * <p><b>Ce qui sort</b> : profil, préférences, toutes les activités avec leurs métriques et
 * leurs tracés GPS — exactement les formes de l'API publique, pour qu'un export se relise
 * avec la même documentation. <b>Ce qui ne sort pas</b> : l'empreinte du mot de passe, les
 * jetons de session, les codes à usage unique. Ce sont des secrets d'authentification,
 * pas des données fournies par l'utilisateur.
 *
 * <p><b>Mémoire.</b> Le document est sérialisé activité par activité, et le contexte de
 * persistance est vidé après chacune : les entités ne s'accumulent pas. Le JSON final est
 * en revanche tenu en mémoire (plusieurs dizaines de Mo pour des centaines de séances
 * longues). Le diffuser en flux supposerait de lire la base après la fin de la requête —
 * hors transaction ; c'est une évolution possible si les volumes l'exigent.
 */
@ApplicationScoped
public class DataExportService {

    /** Version du format d'export, indépendante de celle de l'API. */
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

            // Anti-IDOR : la requête est bornée au sujet du JWT, jamais à un paramètre.
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
                em.clear(); // une activité à la fois dans le contexte de persistance
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
