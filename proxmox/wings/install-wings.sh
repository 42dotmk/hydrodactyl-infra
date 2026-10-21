#!/bin/bash
# Installs Docker and Pterodactyl Wings (https://pterodactyl.io/wings/1.0/installing.html).
# Re-run by Pulumi when WINGS_VERSION changes; safe to run repeatedly.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
cloud-init status --wait >/dev/null || true

if ! command -v docker >/dev/null; then
    curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

curl -fsSL -o /usr/local/bin/wings.new "https://github.com/pterodactyl/wings/releases/download/${WINGS_VERSION}/wings_linux_amd64"
chmod 755 /usr/local/bin/wings.new
mv /usr/local/bin/wings.new /usr/local/bin/wings
mkdir -p /etc/pterodactyl

cat > /etc/systemd/system/wings.service <<'UNIT'
[Unit]
Description=Pterodactyl Wings Daemon
After=docker.service
Requires=docker.service
PartOf=docker.service
# The node config comes from the panel (Admin > Nodes > Configuration); until then stay inactive.
ConditionPathExists=/etc/pterodactyl/config.yml

[Service]
User=root
WorkingDirectory=/etc/pterodactyl
LimitNOFILE=4096
PIDFile=/var/run/wings/daemon.pid
ExecStart=/usr/local/bin/wings
Restart=on-failure
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable wings
if [ -f /etc/pterodactyl/config.yml ]; then systemctl restart wings; fi
/usr/local/bin/wings version
