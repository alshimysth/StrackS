#!/bin/sh
# Restores a StrackS backup (#45). RUN ON THE OPERATOR'S MACHINE, where the private GPG
# key lives (never on the VPS).
#
# Usage:
#   restore.sh <remote object or .dump.gpg file> <destination PostgreSQL URL>
#
#   restore.sh store:stracks-backups/daily/stracks-2026-09-29T031500Z.dump.gpg \
#              postgresql://stracks:PASSWORD@localhost:5432/stracks_restore
#
# The destination database must exist and be EMPTY. `--single-transaction` makes the
# restore atomic: on any error, everything is rolled back and the database stays empty,
# never half restored (PR #88 review). It implies `--exit-on-error`.
set -eu
SOURCE="${1:?object or file to restore}"
TARGET="${2:?destination PostgreSQL URL}"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT

start=$(date +%s)
case "$SOURCE" in
  *:*) rclone copyto "$SOURCE" "$WORK/in.dump.gpg" ;;
  *) cp "$SOURCE" "$WORK/in.dump.gpg" ;;
esac
gpg --batch --yes --output "$WORK/in.dump" --decrypt "$WORK/in.dump.gpg"
pg_restore --single-transaction --no-owner --no-privileges -d "$TARGET" "$WORK/in.dump"
end=$(date +%s)

echo "Restore finished in $((end - start)) s. Check:"
psql "$TARGET" -At -c "select 'users', count(*) from users union all
                        select 'activities', count(*) from activities union all
                        select 'GPS points', count(*) from track_points union all
                        select 'migration max', max(version)::int from flyway_schema_history where success"
