-- V2 — socle activités (Story 2.1) : générique, aucun sport nommé
CREATE TABLE activities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sport_type  TEXT NOT NULL,                 -- code du registre, ex. 'running', 'walking'
    status      TEXT NOT NULL DEFAULT 'in_progress',
                -- 'in_progress' | 'paused' | 'completed' | 'discarded'
    started_at  TIMESTAMPTZ NOT NULL,
    ended_at    TIMESTAMPTZ,
    duration_s  INTEGER,                       -- durée active (pauses exclues)
    distance_m  NUMERIC(10,1),                 -- NULL pour les sports sans distance
    calories    INTEGER,
    notes       TEXT,
    metrics     JSONB NOT NULL DEFAULT '{}',   -- données spécifiques au sport
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_user_date  ON activities (user_id, started_at DESC);
CREATE INDEX idx_activities_user_sport ON activities (user_id, sport_type, started_at DESC);

CREATE TABLE track_points (
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL,              -- ordre dans le tracé, base 0
    recorded_at TIMESTAMPTZ NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    altitude_m  DOUBLE PRECISION,
    accuracy_m  DOUBLE PRECISION,
    PRIMARY KEY (activity_id, seq)
);
