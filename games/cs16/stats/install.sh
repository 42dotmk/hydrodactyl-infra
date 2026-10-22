#!/bin/bash
# Installs lan_stats.py as the sandboxed lan-stats.service on wings-01, serving every CS mode's CSX
# leaderboard at http://$LISTEN/stats.json for lan.apps.42.mk. Runs as root (deploy.sh stats).
# The service runs as a throwaway user that sees each server's amxmodx/data directory read-only.
set -euo pipefail
CS16=$(cd "$(dirname "$0")/.." && pwd)
LISTEN=192.168.101.39:8790

install -D -m 644 "$CS16/stats/lan_stats.py" /usr/local/lib/lan-stats/lan_stats.py
binds=() servers=()
for env in "$CS16"/modes/*.env; do
    mode=$(basename "$env" .env)
    uuid=$(sed -n 's/^SERVER_UUID=//p' "$env")
    data=/var/lib/pterodactyl/volumes/$uuid/cstrike/addons/amxmodx/data
    [ -n "$uuid" ] && [ -d "$data" ] || { echo "skipping $mode: no $data" >&2; continue; }
    binds+=("BindReadOnlyPaths=$data:/run/lan-stats/$mode")
    servers+=("cs-$mode=/run/lan-stats/$mode/csstats.dat")
done
[ ${#servers[@]} -gt 0 ] || { echo "no CS servers found" >&2; exit 1; }

cat >/etc/systemd/system/lan-stats.service <<UNIT
# Managed by games/cs16/stats/install.sh in /root/hydrodactyl-infra (base42) - edit there.
[Unit]
Description=CS 1.6 leaderboards for lan.apps.42.mk
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 -I /usr/local/lib/lan-stats/lan_stats.py --listen $LISTEN ${servers[*]}
DynamicUser=yes
$(printf '%s\n' "${binds[@]}")
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
NoNewPrivileges=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET
SystemCallFilter=@system-service
MemoryMax=128M
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --quiet lan-stats.service
systemctl restart lan-stats.service
sleep 1
systemctl is-active --quiet lan-stats.service || { journalctl -u lan-stats -n 20 --no-pager; exit 1; }
echo "==> lan-stats serving ${#servers[@]} servers at http://$LISTEN/stats.json"
