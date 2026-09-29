#!/bin/sh
# Daily backup of the StrackS database (#45), one run.
#
#   pg_dump (custom format) → archive check → asymmetric GPG encryption
#   → upload off the VPS (S3-compatible storage, through rclone) → retention.
#
# The dump contains GPS tracks (sensitive data): it's encrypted BEFORE leaving the
# container, with a PUBLIC key. The private key is never on the VPS: a compromised VPS
# can't read its own backups.
set -eu

: "${DATABASE_USER:?}" "${DATABASE_PASSWORD:?}" "${BACKUP_BUCKET:?}"
PGHOST="${PGHOST:-postgres}"
PGDATABASE="${PGDATABASE:-stracks}"
KEY="${BACKUP_GPG_PUBLIC_KEY:-/backup/keys/backup-public.asc}"
REMOTE="store:${BACKUP_BUCKET}${BACKUP_PREFIX:+/$BACKUP_PREFIX}"
DAILY_KEEP="${BACKUP_DAILY_KEEP_DAYS:-8}"     # 7 daily + one day of margin
WEEKLY_KEEP="${BACKUP_WEEKLY_KEEP_DAYS:-29}"  # 4 weekly + margin

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [backup] $*"; }
ping_monitor() { [ -n "${BACKUP_PING_URL:-}" ] && wget -q -O /dev/null "${BACKUP_PING_URL}$1" || true; }

fail() { log "FAILED: $*"; ping_monitor /fail; exit 1; }
trap 'fail "unexpected stop (line $LINENO)"' HUP INT TERM

[ -r "$KEY" ] || fail "GPG public key unreadable: $KEY"

STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
export PGPASSWORD="$DATABASE_PASSWORD"

log "dumping $PGDATABASE@$PGHOST"
pg_dump -h "$PGHOST" -U "$DATABASE_USER" -d "$PGDATABASE" -Fc -f "$WORK/stracks.dump" \
  || fail "pg_dump"

# Automatic check: the archive can be read back and does contain the data of the expected
# tables. An empty or truncated dump isn't sent.
pg_restore --list "$WORK/stracks.dump" > "$WORK/toc" || fail "unreadable archive"
for table in users activities track_points flyway_schema_history; do
  grep -q "TABLE DATA public $table " "$WORK/toc" || fail "table missing from the dump: $table"
done
SIZE=$(wc -c < "$WORK/stracks.dump")
log "dump verified ($SIZE bytes)"

gpg --batch --no-tty --quiet --homedir "$WORK" --trust-model always \
  --recipient-file "$KEY" --output "$WORK/stracks.dump.gpg" --encrypt "$WORK/stracks.dump" \
  || fail "encryption"
rm -f "$WORK/stracks.dump"

NAME="stracks-$STAMP.dump.gpg"
rclone copyto --s3-no-check-bucket "$WORK/stracks.dump.gpg" "$REMOTE/daily/$NAME" || fail "daily upload"
if [ "$(date -u +%u)" = "7" ]; then
  rclone copyto --s3-no-check-bucket "$WORK/stracks.dump.gpg" "$REMOTE/weekly/$NAME" || fail "weekly upload"
fi

# Is the object really there, and complete?
# Every command goes through `fail`: under `set -e`, a failure inside a substitution would
# exit without reporting the failure to the monitoring (PR #88 review).
SIZE_JSON=$(rclone size --json "$REMOTE/daily/$NAME") || fail "reading the remote size"
REMOTE_SIZE=$(printf '%s' "$SIZE_JSON" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
LOCAL_SIZE=$(wc -c < "$WORK/stracks.dump.gpg")
[ "$REMOTE_SIZE" = "$LOCAL_SIZE" ] || fail "remote size $REMOTE_SIZE ≠ local $LOCAL_SIZE"

# Today's backup is in place; a failed retention still counts as a failed cycle (PR #88
# review): repeated, it would let the bucket grow forever while the monitoring showed
# "all good".
rclone delete --min-age "${DAILY_KEEP}d" "$REMOTE/daily" \
  || fail "daily retention (backup $NAME itself was uploaded)"
rclone delete --min-age "${WEEKLY_KEEP}d" "$REMOTE/weekly" \
  || fail "weekly retention (backup $NAME itself was uploaded)"

log "OK: $NAME ($LOCAL_SIZE encrypted bytes)"
ping_monitor ""
