-- V5 — jetons de renouvellement de session (Story #44)
--
-- Le secret n'est JAMAIS stocké : seul son SHA-256 l'est. Une fuite de la base ne permet
-- donc pas de rejouer une session.
--
-- Rotation : chaque usage consomme le jeton et en émet un nouveau dans la même « famille »
-- (family_id = une connexion, de la connexion à la déconnexion). Rejouer un jeton déjà
-- tourné révoque toute la famille — c'est la signature d'un vol de jeton.
-- replaced_by trace la chaîne de rotation : elle sert à distinguer un vol d'un simple
-- réessai réseau (la réponse de rotation perdue en route, cas courant en mobilité).
CREATE TABLE refresh_tokens (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash     TEXT NOT NULL UNIQUE,        -- SHA-256 hex du secret, jamais le secret
    family_id      UUID NOT NULL,
    replaced_by    UUID REFERENCES refresh_tokens (id) ON DELETE SET NULL,
    issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ NOT NULL,
    revoked_at     TIMESTAMPTZ,
    revoked_reason TEXT
);

-- Chemin chaud : résolution d'un jeton présenté (unique sur token_hash, déjà indexé).
-- Ces deux index servent la révocation en masse et la purge.
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_user_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
