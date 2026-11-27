#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ $# -le 1 ]] || die 'Usage: sudo bash install.sh [app.example.com]'
if [[ $(id -u) -eq 0 ]]; then
    [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]] || die 'Run from a non-root server account using sudo.'
    exec sudo -u "$SUDO_USER" -- bash "$ROOT/deployment/install.sh" "$@"
fi
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || die 'This installer supports Ubuntu 24.04.'

lock_deployment
created_environment=false
if [[ ! -e "$ENV_FILE" ]]; then
    hostname=${1:-}
    if [[ -z "$hostname" && -t 0 ]]; then
        printf 'Public DNS hostname (example: app.example.com): '
        IFS= read -r hostname || die 'Installation cancelled.'
    fi
    [[ "$hostname" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]] || die 'Provide a public DNS hostname.'
    hostname=${hostname,,}
fi

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl jq openssl
    sudo install -m 0755 -d /etc/apt/keyrings
    if ! sudo test -f /etc/apt/keyrings/docker.asc; then
        key_file=$(mktemp)
        trap 'rm -f -- "$key_file"' EXIT
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$key_file"
        sudo install -m 0644 "$key_file" /etc/apt/keyrings/docker.asc
        rm -f -- "$key_file"
        trap - EXIT
    fi
    if ! sudo test -f /etc/apt/sources.list.d/docker.sources; then
        printf '%s\n' 'Types: deb' 'URIs: https://download.docker.com/linux/ubuntu' \
            'Suites: noble' 'Components: stable' "Architectures: $(dpkg --print-architecture)" \
            'Signed-By: /etc/apt/keyrings/docker.asc' | sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null
    fi
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
if ! command -v jq >/dev/null || ! command -v openssl >/dev/null || ! command -v curl >/dev/null; then
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl jq openssl
fi
sudo systemctl enable --now docker

# Push notification keys (VAPID): a P-256 key pair, printed as the two .env lines the app reads.
vapid_lines() {
    local pem
    pem=$(openssl ecparam -name prime256v1 -genkey -noout)
    b64url() { base64 -w0 | tr '+/' '-_' | tr -d '='; }
    printf 'VAPID_PUBLIC_KEY=%s\n' "$(printf '%s' "$pem" | openssl ec -pubout -outform DER 2>/dev/null | tail -c 65 | b64url)"
    printf 'VAPID_PRIVATE_KEY=%s\n' "$(printf '%s' "$pem" | openssl ec -outform DER 2>/dev/null | head -c 39 | tail -c 32 | b64url)"
}

if [[ ! -e "$ENV_FILE" ]]; then
    app_key=$(openssl rand -base64 32)
    db_password=$(openssl rand -hex 32)
    mysql_root_password=$(openssl rand -hex 32)
    redis_password=$(openssl rand -hex 32)
    reverb_key=$(openssl rand -hex 16)
    reverb_secret=$(openssl rand -hex 32)
    # noclobber also guards against a file created by someone outside this script.
    (
        set -o noclobber
        {
            printf '%s\n' 'APP_NAME="Only in Mongolia"' 'APP_ENV=production' 'APP_DEBUG=false'
            printf 'APP_KEY=base64:%s\nAPP_URL=https://%s\nSITE_ADDRESS=%s\n' "$app_key" "$hostname" "$hostname"
            printf '%s\n' 'HTTP_BIND=80' 'HTTPS_BIND=443' 'SESSION_SECURE_COOKIE=true' 'SESSION_ENCRYPT=true'
            printf '%s\n' 'LOG_LEVEL=warning' 'APP_TIMEZONE=Asia/Ulaanbaatar'
            printf '%s\n' 'DB_DATABASE=only_in_mongolia' 'DB_USERNAME=only_in_mongolia'
            printf 'DB_PASSWORD=%s\n' "$db_password"
            printf 'MYSQL_ROOT_PASSWORD=%s\n' "$mysql_root_password"
            printf 'REDIS_PASSWORD=%s\nQUEUE_WORKERS=2\n' "$redis_password"
            printf 'REVERB_APP_ID=only-in-mongolia\nREVERB_APP_KEY=%s\nREVERB_APP_SECRET=%s\nREVERB_ALLOWED_ORIGINS=%s\n' \
                "$reverb_key" "$reverb_secret" "$hostname"
            printf '%s\n' 'ADMIN_REQUIRE_2FA=true' 'VERIFY_MN_DEV_PHONES=' 'VERIFY_MN_API_KEY=' \
                'QPAY_USERNAME=' 'QPAY_PASSWORD=' 'QPAY_INVOICE_CODE='
            vapid_lines
        } > "$ENV_FILE"
    )
    created_environment=true
    printf 'Created %s with generated credentials.\n' "$ENV_FILE"
else
    missing_credentials=()
    for key in REDIS_PASSWORD MYSQL_ROOT_PASSWORD; do
        if ! grep -Eq "^[[:space:]]*(export[[:space:]]+)?$key[[:space:]]*[:=]" "$ENV_FILE"; then
            missing_credentials+=("$key")
        fi
    done
    if [[ ${#missing_credentials[@]} -gt 0 ]]; then
        # MySQL reads its root password only when initializing an empty volume.
        [[ ! -L "$ENV_FILE" ]] || die 'Expected a regular production environment file.'
        candidate=$(mktemp "$ROOT/.env.docker.tmp.XXXXXXXX")
        trap 'rm -f -- "$candidate"' EXIT
        cat -- "$ENV_FILE" > "$candidate"
        for key in "${missing_credentials[@]}"; do
            password=$(openssl rand -hex 32)
            printf '\n%s=%s\n' "$key" "$password" >> "$candidate"
        done
        mv -- "$candidate" "$ENV_FILE"
        trap - EXIT
    fi
    # Servers set up before real-time updates existed get their Reverb keys once.
    if ! grep -Eq '^[[:space:]]*REVERB_APP_KEY=.+' "$ENV_FILE"; then
        site=$(grep -E '^[[:space:]]*SITE_ADDRESS=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
        printf '\nREVERB_APP_ID=only-in-mongolia\nREVERB_APP_KEY=%s\nREVERB_APP_SECRET=%s\nREVERB_ALLOWED_ORIGINS=%s\n' \
            "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" "${site:-*}" >> "$ENV_FILE"
        printf 'Added real-time (Reverb) keys to %s.\n' "$ENV_FILE"
    fi
    # Servers set up before push notifications existed get their keys once.
    if ! grep -Eq '^[[:space:]]*VAPID_PUBLIC_KEY=.+' "$ENV_FILE"; then
        printf '\n' >> "$ENV_FILE"
        vapid_lines >> "$ENV_FILE"
        printf 'Added push notification keys to %s.\n' "$ENV_FILE"
    fi
fi

# The configuration and deployment commands each take their own lock.
exec 9>&-
if [[ "$created_environment" == true && -t 0 && -t 1 ]]; then
    printf 'Configure Verify.mn, QPay, or upload scanning now? [y/N] '
    IFS= read -r answer || answer=
    if [[ "$answer" == [yY] ]]; then
        bash "$ROOT/deployment/configure.sh"
    fi
fi
exec bash "$ROOT/deployment/deploy.sh" --no-pull
