-- V4 — préférences utilisateur (Story #29)
--
-- Un seul document JSONB plutôt que des colonnes typées : même parti pris que
-- activities.metrics. Ajouter une préférence ne coûte alors AUCUNE migration,
-- et le schéma reste validé par le code applicatif (PreferencesService).
--
-- Le profil physique (poids, taille, naissance, sexe — Story #32) vit sous la
-- clé "physical" du même document : ce sont des données personnelles, elles
-- partent donc avec le compte via le ON DELETE CASCADE déjà en place.
ALTER TABLE users ADD COLUMN preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
