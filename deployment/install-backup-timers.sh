#!/usr/bin/env bash
# One-time setup: systemd timers for automatic backups (times are Mongolian time).
#   Nightly 03:30  online database dump (no downtime)
#   Sunday  04:00  full snapshot: database, uploads and Caddy state (writers pause briefly)
# Usage: sudo bash deployment/install-backup-timers.sh
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

[[ $(id -u) -eq 0 ]] || die 'Run with sudo.'
user=${SUDO_USER:-}
[[ -n "$user" && "$user" != root ]] || die 'Run from the non-root account that deploys, using sudo.'
[[ -f "$ROOT/.env.docker" ]] || die 'Install the app first (bash install.sh).'
command -v rsync >/dev/null || apt-get install -y rsync

# The timers run as the deploying account, so it must reach Docker without a password prompt
# (Docker group, or a NOPASSWD sudo rule for docker). Both are equivalent to root: keep that account locked down.
if ! sudo -u "$user" docker info >/dev/null 2>&1 && ! sudo -u "$user" sudo -n docker info >/dev/null 2>&1; then
    die "$user can't run Docker without a password, so scheduled backups would fail. Add $user to the docker group or allow passwordless sudo for docker, then rerun."
fi

unit() {
    local name=$1 description=$2 args=$3 when=$4
    cat > "/etc/systemd/system/only-in-mongolia-$name.service" <<EOF
[Unit]
Description=Only in Mongolia: $description
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=$user
WorkingDirectory=$ROOT
ExecStart=/bin/bash $ROOT/deployment/scheduled-backup.sh $args
EOF
    cat > "/etc/systemd/system/only-in-mongolia-$name.timer" <<EOF
[Unit]
Description=Only in Mongolia: $description

[Timer]
OnCalendar=$when Asia/Ulaanbaatar
Persistent=true
RandomizedDelaySec=5min

[Install]
WantedBy=timers.target
EOF
}

unit backup-db 'nightly database backup' '' '*-*-* 03:30'
unit backup-full 'weekly full backup' '--full' 'Sun *-*-* 04:00'
systemctl daemon-reload
systemctl enable --now only-in-mongolia-backup-db.timer only-in-mongolia-backup-full.timer
systemctl list-timers 'only-in-mongolia-*' --no-pager
printf '\nBackups land in %s/.deployment/backups.\n' "$ROOT"
printf 'Set BACKUP_RSYNC_TARGET in .env.docker to copy them off this server (strongly recommended).\n'
printf 'Logs: journalctl -u only-in-mongolia-backup-db -u only-in-mongolia-backup-full\n'
