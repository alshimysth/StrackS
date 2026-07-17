-- V3 — horodatage des pauses (socle, agnostique au sport) : nécessaire pour
-- exclure les pauses de duration_s quand la séance est pilotée en ligne.
ALTER TABLE activities ADD COLUMN paused_at TIMESTAMPTZ;
ALTER TABLE activities ADD COLUMN paused_total_s INTEGER NOT NULL DEFAULT 0;
