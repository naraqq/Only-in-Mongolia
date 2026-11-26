#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ $# -eq 0 ]] || die 'Usage: bash deployment/configure.sh'
[[ -t 0 && -t 1 ]] || die 'Run configuration from an interactive terminal.'
lock_deployment
init_docker
[[ ! -L "$ENV_FILE" ]] || die 'Configuration expects a regular .env.docker file.'

read_state
revision=${CURRENT:-$PENDING}
directory="$ROOT"
if [[ -n "$revision" ]]; then
    directory="$STATE/releases/$revision"
fi

resolved_environment() {
    local env_path=$1
    local files=(-f "$directory/compose.yaml")
    if [[ -f "$directory/compose.production.yaml" ]]; then
        files+=(-f "$directory/compose.production.yaml")
    fi
    OIM_ENV_FILE="$env_path" "${DOCKER[@]}" compose --project-name "$PROJECT" \
        --project-directory "$directory" --env-file "$env_path" "${files[@]}" \
        config --format json 2>/dev/null | jq -ce '.services.app.environment'
}

before=$(resolved_environment "$ENV_FILE") || die 'Compose could not read the existing configuration.'
declare -A updates=()

current_setting() {
    jq -r --arg key "$1" '.[$key] // ""' <<< "$before"
}

prompt_value() {
    local key=$1 label=$2 value status=unset
    [[ -z "$(current_setting "$key")" ]] || status=configured
    printf '%s (%s, Enter to keep): ' "$label" "$status"
    IFS= read -rs value || die 'Configuration cancelled.'
    printf '\n'
    if [[ -n "$value" ]]; then
        [[ ! "$value" =~ [[:cntrl:]] ]] || die 'Credentials must fit on one line without control characters.'
        updates["$key"]=$value
    fi
}

effective_setting() {
    if [[ -v "updates[$1]" ]]; then
        printf '%s' "${updates[$1]}"
    else
        current_setting "$1"
    fi
}

printf 'Production provider setup. Input is hidden. Press Enter to leave a field unchanged.\n'
prompt_value VERIFY_MN_API_KEY 'Verify.mn API key'
prompt_value QPAY_USERNAME 'QPay username'
prompt_value QPAY_PASSWORD 'QPay password'
prompt_value QPAY_INVOICE_CODE 'QPay invoice code'
prompt_value SIGHTENGINE_USER 'Sightengine user (optional)'
prompt_value SIGHTENGINE_SECRET 'Sightengine secret (optional)'
prompt_value SENTRY_LARAVEL_DSN 'Sentry Laravel DSN (optional)'

printf 'Queue workers (1–16, Enter to keep): '
IFS= read -r concurrency || die 'Configuration cancelled.'
if [[ -n "$concurrency" ]]; then
    [[ "$concurrency" =~ ^([1-9]|1[0-6])$ ]] || die 'Choose between 1 and 16 queue workers.'
    updates[QUEUE_WORKERS]=$concurrency
fi

printf 'Upload scanning [sightengine / none / Enter to keep]: '
IFS= read -r scanner || die 'Configuration cancelled.'
case "$scanner" in
    sightengine|none) updates[MODERATION_DRIVER]=$scanner ;;
    '') ;;
    *) die 'Choose sightengine or none.' ;;
esac

if [[ "$(effective_setting MODERATION_DRIVER)" == sightengine ]]; then
    [[ -n "$(effective_setting SIGHTENGINE_USER)" && -n "$(effective_setting SIGHTENGINE_SECRET)" ]] ||
        die 'Sightengine scanning requires both credentials.'
fi
if [[ ${#updates[@]} -eq 0 ]]; then
    printf 'No configuration changes requested.\n'
    exit 0
fi

candidate=$(mktemp "$ROOT/.env.docker.tmp.XXXXXXXX")
trap 'rm -f -- "$candidate"' EXIT
while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Z_][A-Z0-9_]*)[[:space:]]*[:=] ]]; then
        key=${BASH_REMATCH[2]}
        [[ ! -v "updates[$key]" ]] || continue
    fi
    printf '%s\n' "$line"
done < "$ENV_FILE" > "$candidate"

for key in "${!updates[@]}"; do
    value=${updates[$key]//\'/\\\'}
    printf "%s='%s'\n" "$key" "$value" >> "$candidate"
done

# Compare parsed values before replacing the file. This catches malformed
# quoting and prevents edits from affecting unrelated settings.
after=$(resolved_environment "$candidate") || die 'Provider settings did not parse. The existing file was preserved.'
for key in "${!updates[@]}"; do
    [[ "$(jq -r --arg key "$key" '.[$key] // ""' <<< "$after")" == "${updates[$key]}" ]] ||
        die "Compose could not read $key exactly. The existing file was preserved."
    before=$(jq -c --arg key "$key" 'del(.[$key])' <<< "$before")
    after=$(jq -c --arg key "$key" 'del(.[$key])' <<< "$after")
done
[[ "$(jq -cS . <<< "$before")" == "$(jq -cS . <<< "$after")" ]] ||
    die 'An unrelated setting would change. The existing file was preserved.'
mv -f -- "$candidate" "$ENV_FILE"
printf 'Provider configuration saved. Run bash deployment/deploy.sh --no-pull to apply it to a running deployment.\n'
