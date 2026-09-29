#!/bin/sh
# Conteneur de sauvegarde (#45) : installe ses outils, puis lance backup.sh chaque jour à
# BACKUP_AT (UTC, 03:15 par défaut). Une boucle plutôt que crond : le crond de busybox ne
# transmet pas les variables d'environnement du conteneur aux tâches.
set -eu

apk add --no-cache --quiet gnupg rclone > /dev/null

AT="${BACKUP_AT:-03:15}"

if [ "${BACKUP_RUN_ONCE:-false}" = "true" ]; then
  exec sh /backup/backup.sh
fi

while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) $AT" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [backup] prochaine sauvegarde dans $(( (next - now) / 60 )) min"
  sleep $((next - now))
  sh /backup/backup.sh || true   # un échec est signalé par backup.sh ; la boucle continue
done
