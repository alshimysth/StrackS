#!/bin/sh
# Essai de bout en bout des sauvegardes (#45), en local, avec les scripts de production.
#   sh deploy/backup/test/run-test.sh
# Sortie : durée de la restauration et comparaison des comptages source / restauré.
set -eu
cd "$(dirname "$0")"
# Projet et dossier de clés propres à CET essai : deux essais simultanés ne se marchent
# pas dessus, et le ménage ne touche que ce que l'essai a créé (revue PR #88).
RUN_ID="$$"
export KEYS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/stracks-backup-keys.XXXXXX")"
C="docker compose -p stracks-backup-test-$RUN_ID -f docker-compose.test.yml"
trap '$C down -v --remove-orphans > /dev/null 2>&1; rm -rf "$KEYS_DIR"' EXIT

# Paire de clés JETABLE, propre à l'essai : la vraie clé privée ne sert jamais ici.
docker run --rm -v "$KEYS_DIR:/keys" alpine@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6 sh -c '
  apk add --no-cache --quiet gnupg >/dev/null
  export GNUPGHOME=$(mktemp -d)
  gpg --batch --quiet --passphrase "" --quick-gen-key "Essai StrackS <essai@example.com>" rsa3072 encr never
  gpg --batch --armor --export > /keys/backup-public.asc
  gpg --batch --armor --pinentry-mode loopback --passphrase "" --export-secret-keys > /keys/backup-private.asc
  chmod 644 /keys/*.asc'

$C up -d --wait source restore-target minio > /dev/null
$C run --rm bucket > /dev/null

echo "== sauvegarde refusée : base sans les tables de l'application"
if $C run --rm -e PGDATABASE=postgres backup; then
  echo "ERREUR : un dump sans les tables attendues a été envoyé"; exit 1
fi
echo "(refus attendu)"

echo "== sauvegarde"
$C run --rm backup

NAME=$($C run --rm --entrypoint sh backup -c 'apk add --no-cache --quiet rclone >/dev/null; rclone lsf store:stracks-backups/daily' | tail -1)
echo "== objet distant : $NAME"

COUNTS="select 'utilisateurs', count(*) from users union all select 'activités', count(*) from activities union all select 'points GPS', count(*) from track_points union all select 'migration max', max(version)::int from flyway_schema_history where success"

echo "== restauration"
$C run --rm restorer '
  apk add --no-cache --quiet gnupg rclone >/dev/null
  gpg --batch --quiet --import /keys/backup-private.asc
  sh /backup/restore.sh "store:stracks-backups/daily/'"$NAME"'" postgresql://stracks:essai@restore-target:5432/stracks_restore'

# Comparaison explicite : afficher les deux comptages ne suffit pas, il faut échouer
# s'ils diffèrent (revue PR #88).
SOURCE=$($C exec -T source psql -U stracks -d stracks -At -c "$COUNTS")
RESTORED=$($C exec -T restore-target psql -U stracks -d stracks_restore -At -c "$COUNTS")
echo "== source :";   echo "$SOURCE"
echo "== restauré :"; echo "$RESTORED"
[ "$SOURCE" = "$RESTORED" ] || { echo "ERREUR : la restauration diffère de la source"; exit 1; }

echo "== restauration atomique : une archive corrompue ne laisse rien derrière elle"
$C exec -T restore-target psql -U stracks -d postgres -qc "create database stracks_atomic" >/dev/null
if $C run --rm restorer '
  apk add --no-cache --quiet gnupg rclone >/dev/null
  gpg --batch --quiet --import /keys/backup-private.asc
  rclone copyto "store:stracks-backups/daily/'"$NAME"'" /tmp/in.gpg
  gpg --batch --quiet --output /tmp/in.dump --decrypt /tmp/in.gpg
  # Tronque l archive aux trois quarts : pg_restore échouera en cours de route.
  head -c $(( $(wc -c < /tmp/in.dump) * 3 / 4 )) /tmp/in.dump > /tmp/cut.dump
  gpg --batch --quiet --trust-model always --recipient-file /keys/backup-public.asc --output /tmp/cut.gpg --encrypt /tmp/cut.dump
  sh /backup/restore.sh /tmp/cut.gpg postgresql://stracks:essai@restore-target:5432/stracks_atomic' > /dev/null 2>&1; then
  echo "ERREUR : une archive tronquée a été restaurée sans erreur"; exit 1
fi
TABLES=$($C exec -T restore-target psql -U stracks -d stracks_atomic -At -c "select count(*) from pg_tables where schemaname = 'public'")
[ "$TABLES" = "0" ] || { echo "ERREUR : restauration partielle, $TABLES table(s) laissée(s)"; exit 1; }
echo "(échec attendu, base laissée vide : $TABLES table)"

echo "== ESSAI RÉUSSI"
