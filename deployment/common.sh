#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
STATE="$ROOT/.deployment"
ENV_FILE="$ROOT/.env.docker"
PROJECT=only-in-mongolia
DOCKER=(docker)

die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

lock_deployment() {
    mkdir -p -- "$STATE/releases" "$STATE/backups"
    exec 9>"$STATE/lock"
    flock -n 9 || die 'Another installation, deployment, rollback, or backup is running.'
}

init_docker() {
    [[ -f "$ENV_FILE" ]] || die 'Missing .env.docker. Run bash deployment/install.sh first.'
    if ! docker info >/dev/null 2>&1; then
        DOCKER=(sudo --preserve-env=OIM_IMAGE,OIM_ENV_FILE,OIM_RELEASE docker)
        "${DOCKER[@]}" info >/dev/null || die 'Cannot reach Docker Engine.'
    fi
}

compose() {
    local revision=$1
    shift
    [[ "$revision" =~ ^[a-f0-9]{40}$ ]] || die 'Invalid release identifier.'
    local directory="$STATE/releases/$revision"
    [[ -f "$directory/compose.yaml" ]] || die "Release $revision is unavailable."
    local files=(-f "$directory/compose.yaml")
    if [[ -f "$directory/compose.production.yaml" ]]; then
        files+=(-f "$directory/compose.production.yaml")
    fi
    OIM_IMAGE="only-in-mongolia:$revision" OIM_ENV_FILE="$ENV_FILE" OIM_RELEASE="$revision" \
        "${DOCKER[@]}" compose --project-name "$PROJECT" --project-directory "$directory" \
        --env-file "$ENV_FILE" "${files[@]}" "$@"
}

read_state() {
    CURRENT=
    PREVIOUS=
    PENDING=
    RECOVERY=
    if [[ -f "$STATE/active" ]]; then
        { IFS= read -r CURRENT; IFS= read -r PREVIOUS; } < "$STATE/active"
    fi
    if [[ -f "$STATE/pending" ]]; then
        { IFS= read -r PENDING; IFS= read -r RECOVERY; } < "$STATE/pending"
    fi
}

record_pending() {
    local file
    file=$(mktemp "$STATE/pending.XXXXXXXX")
    printf '%s\n%s\n' "$1" "$2" > "$file"
    mv -f -- "$file" "$STATE/pending"
}

record_active() {
    local file
    file=$(mktemp "$STATE/active.XXXXXXXX")
    printf '%s\n%s\n' "$1" "$2" > "$file"
    mv -f -- "$file" "$STATE/active"
    rm -f -- "$STATE/pending"
}

public_host() {
    compose "$1" config --format json 2>/dev/null | jq -er '
        .services as $s | $s.proxy.environment.SITE_ADDRESS as $host |
        select($s.app.environment.APP_ENV == "production" and
            ($s.app.environment.APP_DEBUG | ascii_downcase) == "false" and
            ($s.app.environment.SESSION_SECURE_COOKIE | ascii_downcase) == "true" and
            ($s.app.environment.VERIFY_MN_DEV_PHONES // "") == "" and
            ($s.app.environment.APP_KEY | test("^base64:[A-Za-z0-9+/]{43}=$")) and
            $s.app.environment.APP_URL == ("https://" + $host) and
            ($s.db.ports // [] | length) == 0 and
            ($s.redis.ports // [] | length) == 0 and
            (if $s.redis then ($s.redis.environment.REDIS_PASSWORD | test("^[a-f0-9]{64}$")) and
                ($s.worker.scale >= 1 and $s.worker.scale <= 16) else true end)) |
        $host | select(test("^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$"))'
}

verify_release() {
    local revision=$1 host=$2
    compose "$revision" exec -T db sh -ec '
        MYSQL_PWD="$MYSQL_PASSWORD" mysql -h 127.0.0.1 -u "$MYSQL_USER" "$MYSQL_DATABASE" -e "SELECT 1"
    ' >/dev/null || return 1
    local status
    status=$(curl --silent --show-error --fail --retry 24 --retry-delay 5 --retry-max-time 130 \
        --retry-all-errors --max-time 10 --resolve "$host:443:127.0.0.1" \
        --output /dev/null --write-out '%{http_code}' "https://$host/up") || return 1
    [[ "$status" == 200 ]]
}

start_release() {
    local revision=$1 host=$2
    local services=(app worker scheduler)
    # Real-time server (Reverb), in releases that have it (older ones, e.g. after a rollback, don't).
    if compose "$revision" config --services 2>/dev/null | grep -qx reverb; then
        services+=(reverb)
    fi
    compose "$revision" up -d --no-deps --wait --wait-timeout 120 "${services[@]}" || return 1
    compose "$revision" up -d --no-deps --wait --wait-timeout 90 proxy || return 1
    verify_release "$revision" "$host"
}

start_dependencies() {
    local revision=$1 services=(db)
    if [[ -f "$STATE/releases/$revision/compose.production.yaml" ]]; then
        services+=(redis)
    fi
    compose "$revision" up -d --no-deps --wait --wait-timeout 240 "${services[@]}"
}

dump_database() {
    local revision=$1
    shift
    compose "$revision" exec -T db sh -ec '
        export MYSQL_PWD="$MYSQL_PASSWORD"
        exec mysqldump -h 127.0.0.1 -u "$MYSQL_USER" --single-transaction --quick \
            --no-tablespaces --set-gtid-purged=OFF --skip-comments --skip-add-drop-table "$@" "$MYSQL_DATABASE"
    ' dump "$@"
}

schema_fingerprint() {
    local revision=$1
    {
        dump_database "$revision" --no-data | sed -E 's/ AUTO_INCREMENT=[0-9]+//g' || return 1
        # Include the migration ledger to also catch reported data-only migrations.
        compose "$revision" exec -T db sh -ec '
            MYSQL_PWD="$MYSQL_PASSWORD" mysql -h 127.0.0.1 -u "$MYSQL_USER" "$MYSQL_DATABASE" \
                --batch --skip-column-names -e "SELECT migration FROM migrations ORDER BY migration"
        ' || return 1
    } | sha256sum | cut -d ' ' -f 1
}

backup_database() (
    local revision=$1 file temporary
    file="$STATE/backups/$(date -u +%Y%m%dT%H%M%SZ)-${revision:0:12}"
    temporary=$(mktemp "$file.XXXXXXXX")
    trap 'rm -f -- "$temporary"' EXIT
    dump_database "$revision" | gzip -c > "$temporary"
    gzip -t -- "$temporary"
    mv -- "$temporary" "$temporary.sql.gz"
    printf 'Database backup: %s\n' "$temporary.sql.gz"
)

backup_persistent() (
    local revision=$1 temporary volume item
    temporary=$(mktemp -d "$STATE/backups/.snapshot.XXXXXXXX")
    trap 'rm -f -- "$temporary/database.sql.gz" "$temporary/storage.tar.gz"; rmdir -- "$temporary" 2>/dev/null || true' EXIT
    dump_database "$revision" | gzip -c > "$temporary/database.sql.gz"
    gzip -t -- "$temporary/database.sql.gz"

    local mounts=()
    for item in uploads caddy_data caddy_config; do
        volume="${PROJECT}_$item"
        "${DOCKER[@]}" volume inspect "$volume" >/dev/null || die "Required volume $volume is missing."
        mounts+=(--mount "type=volume,src=$volume,dst=/snapshot/$item,readonly")
    done
    "${DOCKER[@]}" run --rm --network none --read-only "${mounts[@]}" \
        --entrypoint tar "only-in-mongolia:$revision" --exclude=./uploads/private/stamped -czf - -C /snapshot . > "$temporary/storage.tar.gz"
    tar -tzf "$temporary/storage.tar.gz" >/dev/null
    local final="$STATE/backups/$(date -u +%Y%m%dT%H%M%SZ)-${revision:0:12}-${temporary##*.}"
    mv -- "$temporary" "$final"
    printf 'Database and storage backup: %s\n' "$final"
)
