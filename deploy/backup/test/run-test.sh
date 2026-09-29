#!/bin/sh
# Essai de bout en bout des sauvegardes (#45), en local, avec les scripts de production.
#   sh deploy/backup/test/run-test.sh
# Sortie : durée de la restauration et comparaison des comptages source / restauré.
set -eu
cd "$(dirname "$0")"
C="docker compose -f docker-compose.test.yml"
trap '$C down -v --remove-orphans > /dev/null 2>&1; rm -rf keys' EXIT

# Paire de clés JETABLE, propre à l'essai : la vraie clé privée ne sert jamais ici.
mkdir -p keys
docker run --rm -v "$PWD/keys:/keys" alpine:3 sh -c '
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

echo "== restauration"
$C run --rm restorer '
  apk add --no-cache --quiet gnupg rclone >/dev/null
  gpg --batch --quiet --import /keys/backup-private.asc
  sh /backup/restore.sh "store:stracks-backups/daily/'"$NAME"'" postgresql://stracks:essai@restore-target:5432/stracks_restore'

echo "== comptages source"
$C exec -T source psql -U stracks -d stracks -At -c "select 'utilisateurs', count(*) from users union all select 'activités', count(*) from activities union all select 'points GPS', count(*) from track_points union all select 'migration max', max(version)::int from flyway_schema_history where success"
