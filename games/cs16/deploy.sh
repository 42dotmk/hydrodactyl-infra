#!/bin/bash
# Ships games/cs16 to the Wings node and runs build.sh there as root.
# usage (from /root/hydrodactyl-infra): mise run cs16:deploy <classic|gungame|deathrun|biohazard>
# The AMXX admin password shared by all CS servers (players: setinfo _pw "<password>") is read from
# .secrets/cs16-admin-password next to mise.toml, if that file exists; never commit it.
set -euo pipefail
MODE=${1:?usage: mise run cs16:deploy <mode>}
HERE=$(cd "$(dirname "$0")" && pwd)
PROXMOX=$HERE/../../proxmox

KEY=$(mktemp); trap 'rm -f "$KEY"' EXIT; chmod 600 "$KEY"
(cd "$PROXMOX" && pulumi stack output --stack prod --show-secrets wingsSshPrivateKey) >"$KEY"
HOST=$(cd "$PROXMOX" && pulumi stack output --stack prod wingsAddress)
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/root/.ssh/known_hosts_wings -o LogLevel=ERROR "ubuntu@$HOST")
REMOTE=/tmp/cs16-deploy-$$

SECRETS=$HERE/../../.secrets
PW_FILE=()
[ -s "$SECRETS/cs16-admin-password" ] && PW_FILE=(-C "$SECRETS" cs16-admin-password)
tar -C "$HERE" -czf - . "${PW_FILE[@]}" | "${SSH[@]}" "mkdir -p -m 700 $REMOTE && tar -xzf - -C $REMOTE"
"${SSH[@]}" "sudo ADMIN_PASSWORD_FILE=$REMOTE/cs16-admin-password bash $REMOTE/build.sh $MODE; rc=\$?; rm -rf $REMOTE; exit \$rc"
