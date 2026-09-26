-- V7 — codes à usage unique du compte (#74 mot de passe oublié, #75 email)
--
-- Un seul besoin, une seule table : un code envoyé par email prouve le contrôle d'une
-- adresse, quel que soit le motif. `purpose` est un TEXT contrôlé par l'application
-- (même règle que sport_type : jamais d'ENUM SQL, jamais d'ALTER TYPE).
--
-- Le code n'est JAMAIS stocké en clair : seulement son empreinte BCrypt. Contrairement
-- au refresh token (256 bits, SHA-256 suffit), un code saisi à la main a peu d'entropie ;
-- une empreinte rapide se casserait hors ligne en cas de fuite de la base.
CREATE TABLE account_codes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose      TEXT NOT NULL,
    code_hash    TEXT NOT NULL,
    -- Nouvelle adresse d'un changement d'email : elle ne devient l'email du compte
    -- qu'à la confirmation du code reçu sur cette adresse.
    target_email TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chemin chaud : le code encore utilisable d'un utilisateur pour un motif donné.
CREATE INDEX idx_account_codes_active ON account_codes (user_id, purpose) WHERE consumed_at IS NULL;

-- Vérification d'adresse (#75). NULL = jamais vérifiée : c'est l'état honnête des comptes
-- existants, créés avant que la vérification n'existe.
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
