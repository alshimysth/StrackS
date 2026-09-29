#!/bin/sh
# Sauvegarde quotidienne de la base StrackS (#45) — une exécution.
#
#   pg_dump (format custom) → vérification de l'archive → chiffrement GPG asymétrique
#   → envoi hors du VPS (stockage S3 compatible, via rclone) → rétention.
#
# Le dump contient des tracés GPS (données sensibles) : il est chiffré AVANT de quitter le
# conteneur, avec une clé PUBLIQUE. La clé privée n'est jamais sur le VPS : un VPS
# compromis ne peut pas relire ses propres sauvegardes.
set -eu

: "${DATABASE_USER:?}" "${DATABASE_PASSWORD:?}" "${BACKUP_BUCKET:?}"
PGHOST="${PGHOST:-postgres}"
PGDATABASE="${PGDATABASE:-stracks}"
KEY="${BACKUP_GPG_PUBLIC_KEY:-/backup/keys/backup-public.asc}"
REMOTE="store:${BACKUP_BUCKET}${BACKUP_PREFIX:+/$BACKUP_PREFIX}"
DAILY_KEEP="${BACKUP_DAILY_KEEP_DAYS:-8}"     # 7 quotidiens + marge d'un jour
WEEKLY_KEEP="${BACKUP_WEEKLY_KEEP_DAYS:-29}"  # 4 hebdomadaires + marge

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [backup] $*"; }
ping_monitor() { [ -n "${BACKUP_PING_URL:-}" ] && wget -q -O /dev/null "${BACKUP_PING_URL}$1" || true; }

fail() { log "ÉCHEC : $*"; ping_monitor /fail; exit 1; }
trap 'fail "arrêt inattendu (ligne $LINENO)"' HUP INT TERM

[ -r "$KEY" ] || fail "clé publique GPG illisible : $KEY"

STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
export PGPASSWORD="$DATABASE_PASSWORD"

log "dump de $PGDATABASE@$PGHOST"
pg_dump -h "$PGHOST" -U "$DATABASE_USER" -d "$PGDATABASE" -Fc -f "$WORK/stracks.dump" \
  || fail "pg_dump"

# Vérification automatique : l'archive se relit, et contient bien les données des tables
# attendues. Un dump vide ou tronqué ne part pas.
pg_restore --list "$WORK/stracks.dump" > "$WORK/toc" || fail "archive illisible"
for table in users activities track_points flyway_schema_history; do
  grep -q "TABLE DATA public $table " "$WORK/toc" || fail "table absente du dump : $table"
done
SIZE=$(wc -c < "$WORK/stracks.dump")
log "dump vérifié ($SIZE octets)"

gpg --batch --no-tty --quiet --homedir "$WORK" --trust-model always \
  --recipient-file "$KEY" --output "$WORK/stracks.dump.gpg" --encrypt "$WORK/stracks.dump" \
  || fail "chiffrement"
rm -f "$WORK/stracks.dump"

NAME="stracks-$STAMP.dump.gpg"
rclone copyto --s3-no-check-bucket "$WORK/stracks.dump.gpg" "$REMOTE/daily/$NAME" || fail "envoi quotidien"
if [ "$(date -u +%u)" = "7" ]; then
  rclone copyto --s3-no-check-bucket "$WORK/stracks.dump.gpg" "$REMOTE/weekly/$NAME" || fail "envoi hebdomadaire"
fi

# L'objet est-il vraiment là, et entier ?
# Chaque commande passe par `fail` : sous `set -e`, un échec dans une substitution
# sortirait sans signaler l'échec à la surveillance (revue PR #88).
SIZE_JSON=$(rclone size --json "$REMOTE/daily/$NAME") || fail "lecture de la taille distante"
REMOTE_SIZE=$(printf '%s' "$SIZE_JSON" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
LOCAL_SIZE=$(wc -c < "$WORK/stracks.dump.gpg")
[ "$REMOTE_SIZE" = "$LOCAL_SIZE" ] || fail "taille distante $REMOTE_SIZE ≠ locale $LOCAL_SIZE"

# La sauvegarde du jour est en place ; une rétention en échec compte pourtant comme un
# échec du cycle (revue PR #88) : répétée, elle laisserait le bucket grossir sans fin
# pendant que la surveillance afficherait « tout va bien ».
rclone delete --min-age "${DAILY_KEEP}d" "$REMOTE/daily" \
  || fail "rétention quotidienne (la sauvegarde $NAME, elle, est bien envoyée)"
rclone delete --min-age "${WEEKLY_KEEP}d" "$REMOTE/weekly" \
  || fail "rétention hebdomadaire (la sauvegarde $NAME, elle, est bien envoyée)"

log "OK : $NAME ($LOCAL_SIZE octets chiffrés)"
ping_monitor ""
