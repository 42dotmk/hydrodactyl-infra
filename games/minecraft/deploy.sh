#!/bin/bash
# Ships games/minecraft to the Wings node and runs install.sh there as root.
# usage (from /root/hydrodactyl-infra): mise run minecraft:deploy
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
PROXMOX=$HERE/../../proxmox

KEY=$(mktemp); trap 'rm -f "$KEY"' EXIT; chmod 600 "$KEY"
(cd "$PROXMOX" && pulumi stack output --stack prod --show-secrets wingsSshPrivateKey) >"$KEY"
HOST=$(cd "$PROXMOX" && pulumi stack output --stack prod wingsAddress)
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/root/.ssh/known_hosts_wings -o LogLevel=ERROR "ubuntu@$HOST")
REMOTE=/tmp/minecraft-deploy-$$

tar -C "$HERE" -czf - . | "${SSH[@]}" "mkdir -p -m 700 $REMOTE && tar -xzf - -C $REMOTE"
"${SSH[@]}" "sudo bash $REMOTE/install.sh; rc=\$?; rm -rf $REMOTE; exit \$rc"
