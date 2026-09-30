#!/bin/sh
# End-to-end backup test (#45), run locally, with the production scripts.
#   sh deploy/backup/test/run-test.sh
# Output: restore duration and comparison of source / restored counts.
set -eu
cd "$(dirname "$0")"
# Project and key directory specific to THIS run: two simultaneous runs don't step on each
# other, and cleanup only touches what the run created (PR #88 review).
RUN_ID="$$"
export KEYS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/stracks-backup-keys.XXXXXX")"
C="docker compose -p stracks-backup-test-$RUN_ID -f docker-compose.test.yml"
trap '$C down -v --remove-orphans > /dev/null 2>&1; rm -rf "$KEYS_DIR"' EXIT

# THROWAWAY key pair, specific to the run: the real private key is never used here.
docker run --rm -v "$KEYS_DIR:/keys" alpine@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6 sh -c '
  apk add --no-cache --quiet gnupg >/dev/null
  export GNUPGHOME=$(mktemp -d)
  gpg --batch --quiet --passphrase "" --quick-gen-key "Essai StrackS <essai@example.com>" rsa3072 encr never
  gpg --batch --armor --export > /keys/backup-public.asc
  gpg --batch --armor --pinentry-mode loopback --passphrase "" --export-secret-keys > /keys/backup-private.asc
  chmod 644 /keys/*.asc'

$C up -d --wait source restore-target minio > /dev/null
$C run --rm bucket > /dev/null

echo "== backup rejected: database without the application tables"
if $C run --rm -e PGDATABASE=postgres backup; then
  echo "ERROR: a dump without the expected tables was uploaded"; exit 1
fi
echo "(rejection expected)"

echo "== backup"
$C run --rm backup

NAME=$($C run --rm --entrypoint sh backup -c 'apk add --no-cache --quiet rclone >/dev/null; rclone lsf store:stracks-backups/daily' | tail -1)
echo "== remote object: $NAME"

COUNTS="select 'users', count(*) from users union all select 'activities', count(*) from activities union all select 'GPS points', count(*) from track_points union all select 'migration max', max(version)::int from flyway_schema_history where success"

echo "== restore"
$C run --rm restorer '
  apk add --no-cache --quiet gnupg rclone >/dev/null
  gpg --batch --quiet --import /keys/backup-private.asc
  sh /backup/restore.sh "store:stracks-backups/daily/'"$NAME"'" postgresql://stracks:essai@restore-target:5432/stracks_restore'

# Explicit comparison: printing both counts isn't enough, the run must fail if they
# differ (PR #88 review).
SOURCE=$($C exec -T source psql -U stracks -d stracks -At -c "$COUNTS")
RESTORED=$($C exec -T restore-target psql -U stracks -d stracks_restore -At -c "$COUNTS")
echo "== source:";   echo "$SOURCE"
echo "== restored:"; echo "$RESTORED"
[ "$SOURCE" = "$RESTORED" ] || { echo "ERROR: the restore differs from the source"; exit 1; }

echo "== atomic restore: a corrupted archive leaves nothing behind"
$C exec -T restore-target psql -U stracks -d postgres -qc "create database stracks_atomic" >/dev/null
if $C run --rm restorer '
  apk add --no-cache --quiet gnupg rclone >/dev/null
  gpg --batch --quiet --import /keys/backup-private.asc
  rclone copyto "store:stracks-backups/daily/'"$NAME"'" /tmp/in.gpg
  gpg --batch --quiet --output /tmp/in.dump --decrypt /tmp/in.gpg
  # Truncate the archive to three quarters: pg_restore will fail midway.
  head -c $(( $(wc -c < /tmp/in.dump) * 3 / 4 )) /tmp/in.dump > /tmp/cut.dump
  gpg --batch --quiet --trust-model always --recipient-file /keys/backup-public.asc --output /tmp/cut.gpg --encrypt /tmp/cut.dump
  sh /backup/restore.sh /tmp/cut.gpg postgresql://stracks:essai@restore-target:5432/stracks_atomic' > /dev/null 2>&1; then
  echo "ERROR: a truncated archive was restored without error"; exit 1
fi
TABLES=$($C exec -T restore-target psql -U stracks -d stracks_atomic -At -c "select count(*) from pg_tables where schemaname = 'public'")
[ "$TABLES" = "0" ] || { echo "ERROR: partial restore, $TABLES table(s) left behind"; exit 1; }
echo "(failure expected, database left empty: $TABLES table)"

echo "== TEST PASSED"
