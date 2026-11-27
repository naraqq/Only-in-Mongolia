#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ $# -eq 0 ]] || die 'Usage: bash deployment/rollback.sh'
lock_deployment
init_docker
read_state
if [[ -n "$PENDING" ]]; then
    target=$RECOVERY
    running=$PENDING
else
    target=$PREVIOUS
    running=$CURRENT
fi
if [[ -z "$target" ]]; then
    [[ -z "$PENDING" ]] || die 'The first deployment has no previous release. See deployment/README.md.'
    printf 'There is no previous release to restore.\n'
    exit 0
fi
host=$(public_host "$target") || die 'Invalid production environment settings.'
"${DOCKER[@]}" image inspect "only-in-mongolia:$target" >/dev/null || die 'The previous application image is missing.'
[[ -s "$STATE/releases/$target/.deployed-schema" ]] || die 'The previous release has no recorded schema.'
live_schema=$(schema_fingerprint "$running")
[[ "$live_schema" == "$(<"$STATE/releases/$target/.deployed-schema")" ]] ||
    die 'Database schema or migration history differs. Rollback refused before stopping services. See deployment/README.md.'

backup_database "$running"
# Preserve the recovery target if a rollback is interrupted.
record_pending "$running" "$target"
stop_writers "$running"
start_dependencies "$target"
start_release "$target" "$host"
record_active "$target" ''
printf 'Restored %s at https://%s. Database data was preserved.\n' "$target" "$host"
