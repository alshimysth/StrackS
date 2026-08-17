-- V6 — titre d'activité (Story #25)
--
-- Champ commun à tous les sports, donc dans la table plutôt que dans `metrics` JSONB :
-- le titre n'a rien de propre à un sport, et l'enfouir dans le JSON le rendrait
-- interrogeable seulement par les plugins — alors qu'un futur écran de recherche
-- voudra filtrer dessus sans connaître le sport.
--
-- Nullable à dessein : l'écrasante majorité des séances n'aura jamais de titre, et une
-- valeur par défaut fabriquée (« Course du 14 août ») figerait en base une chaîne que
-- l'affichage sait déjà dériver de la date et du sport — avec l'inconvénient de ne plus
-- suivre la langue de l'utilisateur une fois #43 tranchée.
ALTER TABLE activities ADD COLUMN title TEXT;

-- Borne défensive : le titre est saisi librement côté mobile, et la validation
-- applicative (@Size) peut être contournée par un appel direct à l'API.
ALTER TABLE activities ADD CONSTRAINT activities_title_length CHECK (title IS NULL OR length(title) <= 120);
