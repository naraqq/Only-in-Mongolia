#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ $# -eq 0 || ( $# -eq 1 && "$1" == --database-only ) ]] || die 'Usage: bash backup.sh [--database-only]'
lock_deployment
init_docker
read_state
revision=${CURRENT:-$PENDING}
[[ -n "$revision" ]] || die 'There is no deployment to back up.'
if [[ $# -eq 1 ]]; then
    backup_database "$revision"
    exit 0
fi
[[ -z "$PENDING" ]] || die 'A release is pending. Use --database-only or finish recovery before a full snapshot.'
host=$(public_host "$revision") || die 'Invalid production environment settings.'

# Stop writers while taking the SQL and filesystem snapshots. Always attempt
# to bring the existing release back, including after a failed snapshot.
resume_release() {
    local status=$?
    trap - EXIT
    start_release "$revision" "$host" || status=1
    exit "$status"
}
trap resume_release EXIT
compose "$revision" stop app worker scheduler
backup_persistent "$revision"
