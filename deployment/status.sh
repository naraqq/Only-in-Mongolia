#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ $# -eq 0 ]] || die 'Usage: bash status.sh'
init_docker
read_state
revision=${PENDING:-$CURRENT}
[[ -n "$revision" ]] || die 'There is no deployment to inspect.'
printf 'Active: %s\nPrevious: %s\nPending: %s\n' "${CURRENT:-none}" "${PREVIOUS:-none}" "${PENDING:-none}"
compose "$revision" ps --all
if [[ -f "$STATE/releases/$revision/compose.production.yaml" ]]; then
    expected_workers=$(compose "$revision" config --format json 2>/dev/null | jq -er '.services.worker.scale')
    compose "$revision" ps --format json | jq -es --argjson workers "$expected_workers" '
        [.[] | if type == "array" then .[] else . end] as $rows |
        {app:3, worker:$workers, scheduler:1, proxy:1, db:1, redis:1} |
        to_entries | all(. as $entry |
            [$rows[] | select(.Service == $entry.key and .State == "running" and .Health == "healthy")] |
            length == $entry.value)' >/dev/null || die 'One or more required containers are missing or unhealthy.'
fi
host=$(public_host "$revision") || die 'Invalid production environment settings.'
printf 'HTTPS health: '
status=$(curl --silent --show-error --fail --max-time 10 --resolve "$host:443:127.0.0.1" \
    --output /dev/null --write-out '%{http_code}' "https://$host/up") || die 'The HTTPS health endpoint is unavailable.'
printf '%s\n' "$status"
[[ "$status" == 200 && -z "$PENDING" ]]
