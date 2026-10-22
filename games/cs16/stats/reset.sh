#!/bin/bash
# Wipes the all-time CSX leaderboard of one CS mode (or all): sets csstats_reset 1 and restarts the
# map, which is when CSX clears and saves its stats. Players on the server reconnect automatically.
# Runs as root on wings-01 (deploy.sh reset-stats <mode|all>); talks to the local Wings API.
set -euo pipefail
CS16=$(cd "$(dirname "$0")/.." && pwd)
TARGET=${1:?usage: reset.sh <mode|all>}
if [ "$TARGET" = all ]; then envs=("$CS16"/modes/*.env); else envs=("$CS16/modes/$TARGET.env"); fi
[ -f "${envs[0]}" ] || { echo "unknown mode '$TARGET'" >&2; exit 1; }

C=/etc/pterodactyl/config.yml
TOKEN=$(awk '/^token:/{print $2}' "$C" | tr -d '"')
PORT=$(awk '/^api:/{f=1} f&&/port:/{print $2; exit}' "$C")
SSL=$(awk '/^  ssl:/{f=1} f&&/enabled:/{print $2; exit}' "$C")
SCHEME=http; [ "$SSL" = true ] && SCHEME=https
for env in "${envs[@]}"; do
    mode=$(basename "$env" .env)
    uuid=$(sed -n 's/^SERVER_UUID=//p' "$env")
    code=$(curl -sk -o /dev/null -w '%{http_code}' -X POST "$SCHEME://127.0.0.1:$PORT/api/servers/$uuid/commands" \
        -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json' \
        -d '{"commands":["csstats_reset 1","restart"]}')
    [ "$code" = 204 ] && echo "==> $mode: stats reset" || { echo "$mode: Wings answered HTTP $code (server offline?)" >&2; exit 1; }
done
