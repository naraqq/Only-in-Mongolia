#!/usr/bin/env bash
# Run by the backup timers (see install-backup-timers.sh).
#   bash deployment/scheduled-backup.sh           nightly: online database dump, no downtime
#   bash deployment/scheduled-backup.sh --full    weekly: database + uploads + Caddy state (writers pause briefly)
# Then prunes old backups and, if BACKUP_RSYNC_TARGET is set in .env.docker, copies them off this server.
set -Eeuo pipefail
umask 077

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
BACKUPS="$ROOT/.deployment/backups"
mode=${1:-}
[[ $# -le 1 && ( -z "$mode" || "$mode" == --full ) ]] || { echo 'Usage: scheduled-backup.sh [--full]' >&2; exit 2; }

# Optional settings, read from .env.docker without loading anything else from it.
setting() { sed -nE "s/^[[:space:]]*$1=[\"']?([^\"']*)[\"']?[[:space:]]*$/\\1/p" "$ROOT/.env.docker" | tail -n 1; }
keep_days=$(setting BACKUP_KEEP_DAYS); keep_days=${keep_days:-14}
keep_full_days=$(setting BACKUP_KEEP_FULL_DAYS); keep_full_days=${keep_full_days:-56}
target=$(setting BACKUP_RSYNC_TARGET)
[[ "$keep_days" =~ ^[0-9]+$ && "$keep_full_days" =~ ^[0-9]+$ ]] || { echo 'BACKUP_KEEP_DAYS and BACKUP_KEEP_FULL_DAYS must be whole numbers.' >&2; exit 2; }

if [[ "$mode" == --full ]]; then
    bash "$ROOT/deployment/backup.sh"
else
    bash "$ROOT/deployment/backup.sh" --database-only
fi

# Prune: database dumps are files, full snapshots are folders. Never touch an unfinished snapshot.
find "$BACKUPS" -mindepth 1 -maxdepth 1 -type f -name '*.sql.gz' -mtime +"$keep_days" -delete
find "$BACKUPS" -mindepth 1 -maxdepth 1 -type d ! -name '.snapshot.*' -mtime +"$keep_full_days" -exec rm -rf -- {} +

# Off-site copy (e.g. BACKUP_RSYNC_TARGET=backup@storage.example.com:only-in-mongolia/). Uses this account's SSH key.
if [[ -n "$target" ]]; then
    # Only finished archives: skip unfinished snapshots and any half-written temporary file.
    rsync -a --exclude '.snapshot.*/' --include '*/' --include '*.sql.gz' --include '*.tar.gz' --exclude '*' -- "$BACKUPS/" "$target"
    echo "Copied backups to $target"
fi
