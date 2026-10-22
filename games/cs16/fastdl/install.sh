#!/bin/bash
# Installs fastdl.py as the sandboxed cs16-fastdl.service on wings-01: HTTP fast download for every CS
# mode at http://$LISTEN/<mode>/ (build.sh points sv_downloadurl there). Runs as root (deploy.sh fastdl).
# The service runs as a throwaway user that sees each cstrike directory read-only; addons/ (users.ini)
# and the config files are masked inside the sandbox too, behind fastdl.py's own allowlist.
set -euo pipefail
CS16=$(cd "$(dirname "$0")/.." && pwd)
LISTEN=192.168.101.39:27080

install -D -m 644 "$CS16/fastdl/fastdl.py" /usr/local/lib/cs16-fastdl/fastdl.py
mounts=() servers=()
for env in "$CS16"/modes/*.env; do
    mode=$(basename "$env" .env)
    uuid=$(sed -n 's/^SERVER_UUID=//p' "$env")
    cstrike=/var/lib/pterodactyl/volumes/$uuid/cstrike
    [ -n "$uuid" ] && [ -d "$cstrike/maps" ] || { echo "skipping $mode: no $cstrike" >&2; continue; }
    in=/run/cs16-fastdl/$mode
    mounts+=("BindReadOnlyPaths=$cstrike:$in")
    mounts+=("InaccessiblePaths=-$in/addons -$in/server.cfg -$in/reunion.cfg -$in/listenserver.cfg -$in/banned.cfg -$in/listip.cfg -$in/logs")
    servers+=("$mode=$in")
done
[ ${#servers[@]} -gt 0 ] || { echo "no CS servers found" >&2; exit 1; }

cat >/etc/systemd/system/cs16-fastdl.service <<UNIT
# Managed by games/cs16/fastdl/install.sh in /root/hydrodactyl-infra (base42) - edit there.
[Unit]
Description=CS 1.6 fast download (sv_downloadurl) for the LAN servers
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 -I /usr/local/lib/cs16-fastdl/fastdl.py --listen $LISTEN ${servers[*]}
DynamicUser=yes
$(printf '%s\n' "${mounts[@]}")
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
MemoryMax=256M
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --quiet cs16-fastdl.service
systemctl restart cs16-fastdl.service
sleep 1
systemctl is-active --quiet cs16-fastdl.service || { journalctl -u cs16-fastdl -n 20 --no-pager; exit 1; }
echo "==> cs16-fastdl serving ${#servers[@]} servers at http://$LISTEN/<mode>/"
