#!/usr/bin/env bash
# CI: the real-time server (Reverb) answers WebSocket handshakes through the proxy, and its event API is not
# reachable from outside. Run after `docker compose up`, with .env.docker in the working directory.
set -euo pipefail

key="$(grep '^REVERB_APP_KEY=' .env.docker | tail -1 | cut -d= -f2-)"
url="http://localhost:8080/app/${key}?protocol=7&client=js&version=8.4.0"

# A WebSocket handshake: Reverb answers "101 Switching Protocols". curl then waits on the open socket, so cap it.
status="$(curl --silent --include --max-time 3 --http1.1 \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Origin: http://localhost:8080' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    "$url" | head -1 || true)"
echo "WebSocket handshake: ${status}"
[[ "$status" == *" 101"* ]]

api="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST http://localhost:8080/apps/only-in-mongolia/events)"
echo "Event API from outside: ${api}"
[[ "$api" == 404 ]]
