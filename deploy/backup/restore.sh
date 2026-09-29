#!/bin/sh
# Restauration d'une sauvegarde StrackS (#45) — À LANCER SUR LE POSTE DE L'OPÉRATEUR, là
# où se trouve la clé GPG privée (jamais sur le VPS).
#
# Usage :
#   restore.sh <objet distant ou fichier .dump.gpg> <URL PostgreSQL de destination>
#
#   restore.sh store:stracks-backups/daily/stracks-2026-09-29T031500Z.dump.gpg \
#              postgresql://stracks:MOTDEPASSE@localhost:5432/stracks_restore
#
# La base de destination doit exister et être VIDE : `--exit-on-error` arrête à la
# première erreur plutôt que de laisser une base à moitié restaurée.
set -eu
SOURCE="${1:?objet ou fichier à restaurer}"
TARGET="${2:?URL PostgreSQL de destination}"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT

start=$(date +%s)
case "$SOURCE" in
  *:*) rclone copyto "$SOURCE" "$WORK/in.dump.gpg" ;;
  *) cp "$SOURCE" "$WORK/in.dump.gpg" ;;
esac
gpg --batch --yes --output "$WORK/in.dump" --decrypt "$WORK/in.dump.gpg"
pg_restore --exit-on-error --no-owner --no-privileges -d "$TARGET" "$WORK/in.dump"
end=$(date +%s)

echo "Restauration terminée en $((end - start)) s. Contrôle :"
psql "$TARGET" -At -c "select 'utilisateurs', count(*) from users union all
                        select 'activités', count(*) from activities union all
                        select 'points GPS', count(*) from track_points union all
                        select 'migration max', max(version)::int from flyway_schema_history where success"
