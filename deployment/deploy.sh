#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
mode=${1:-}
[[ $# -le 1 && ( -z "$mode" || "$mode" == --no-pull || "$mode" == --resume || "$mode" == --forward-fix ) ]] ||
    die 'Usage: bash deploy.sh [--no-pull | --resume | --forward-fix]'
lock_deployment
init_docker
read_state

cd -- "$ROOT"
changes=$(git status --porcelain)
[[ -z "$changes" ]] || die 'The server checkout must be clean and committed.'
if [[ "$mode" == --resume ]]; then
    [[ -n "$PENDING" && "$PENDING" != "$CURRENT" ]] || die 'There is no deployment to resume. Use rollback.sh to resume an interrupted rollback.'
    revision=$PENDING
elif [[ "$mode" == --forward-fix ]]; then
    [[ -n "$PENDING" && "$PENDING" != "$CURRENT" ]] || die 'There is no failed deploy to repair.'
    git pull --ff-only
    revision=$(git rev-parse HEAD)
    [[ "$revision" != "$PENDING" && "$revision" != "$CURRENT" ]] || die 'Push a new repair commit before running --forward-fix.'
    git merge-base --is-ancestor "$PENDING" "$revision" || die 'The repair must be based on the failed candidate.'
else
    [[ -z "$PENDING" ]] || die 'An interrupted deployment is pending. See deployment/README.md.'
    if [[ -z "$mode" ]]; then
        git pull --ff-only
    fi
    revision=$(git rev-parse HEAD)
fi
if [[ "$revision" == "$CURRENT" ]]; then
    host=$(public_host "$CURRENT") || die 'Invalid production environment settings.'
    start_dependencies "$CURRENT"
    start_release "$CURRENT" "$host"
    printf 'Release %s is already healthy.\n' "$CURRENT"
    exit 0
fi

directory="$STATE/releases/$revision"
if [[ ! -d "$directory" ]]; then
    staging=$(mktemp -d "$STATE/releases/.staging.XXXXXXXX")
    git archive "$revision" | tar -x -C "$staging"
    mv -- "$staging" "$directory"
fi
host=$(public_host "$revision") || die 'Invalid production environment settings.'
if ! "${DOCKER[@]}" image inspect "only-in-mongolia:$revision" >/dev/null 2>&1; then
    compose "$revision" build app
fi
# Record recovery intent before touching the running version or database.
record_pending "$revision" "$CURRENT"
deploy_pid=$BASHPID
recover_failed_deploy() {
    local status=$?
    trap - ERR
    [[ "$BASHPID" == "$deploy_pid" ]] || exit "$status"
    printf 'Deployment failed before promotion.\n' >&2
    if [[ -n "$CURRENT" ]]; then
        exec 9>&-
        bash "$ROOT/deployment/rollback.sh" || printf 'Automatic recovery did not complete. See DEPLOYMENT.md.\n' >&2
    else
        printf 'Review the failure, then resume with bash deploy.sh --resume.\n' >&2
    fi
    exit "$status"
}
trap recover_failed_deploy ERR
if [[ -n "$CURRENT" ]]; then
    compose "$CURRENT" stop app worker scheduler
else
    compose "$revision" stop app worker scheduler
fi
start_dependencies "$revision"
backup_database "$revision"
compose "$revision" run --rm --no-deps -T migrate
start_release "$revision" "$host"
fingerprint=$(schema_fingerprint "$revision")
printf '%s\n' "$fingerprint" > "$directory/.deployed-schema"
record_active "$revision" "$CURRENT"
printf 'Deployed %s at https://%s\n' "$revision" "$host"
