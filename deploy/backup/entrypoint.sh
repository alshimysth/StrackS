#!/bin/sh
# Backup container (#45): installs its tools, then runs backup.sh every day at BACKUP_AT
# (UTC, 03:15 by default). A loop rather than crond: busybox's crond doesn't pass the
# container's environment variables to its jobs.
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
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [backup] next backup in $(( (next - now) / 60 )) min"
  sleep $((next - now))
  sh /backup/backup.sh || true   # a failure is reported by backup.sh; the loop goes on
done
