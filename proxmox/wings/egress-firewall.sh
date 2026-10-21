#!/bin/bash
# Installs wings-egress-firewall.service: game containers (bridge pterodactyl0) may answer players and
# reach the internet, but may not open connections into private networks (office LAN, vnet01, VPN).
# Traffic between containers on pterodactyl0 is untouched. Re-run by Pulumi when this file changes.
set -euo pipefail

cat > /usr/local/sbin/wings-egress-firewall <<'RULES'
#!/bin/sh
set -e
apply() {
    ipt=$1; shift
    $ipt -N WINGS-EGRESS 2>/dev/null || $ipt -F WINGS-EGRESS
    $ipt -A WINGS-EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
    for net in "$@"; do $ipt -A WINGS-EGRESS -d "$net" -j DROP; done
    $ipt -C DOCKER-USER -i pterodactyl0 ! -o pterodactyl0 -j WINGS-EGRESS 2>/dev/null \
        || $ipt -I DOCKER-USER -i pterodactyl0 ! -o pterodactyl0 -j WINGS-EGRESS
}
apply iptables 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16
apply ip6tables fc00::/7 fe80::/10
RULES
chmod 755 /usr/local/sbin/wings-egress-firewall

cat > /etc/systemd/system/wings-egress-firewall.service <<'UNIT'
[Unit]
Description=Block Wings game containers from private networks
# DOCKER-USER exists once Docker is up; re-apply whenever Docker (re)starts.
After=docker.service
Requires=docker.service
PartOf=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/wings-egress-firewall

[Install]
WantedBy=multi-user.target docker.service
UNIT

systemctl daemon-reload
systemctl enable wings-egress-firewall.service
systemctl restart wings-egress-firewall.service
iptables -S WINGS-EGRESS
iptables -S DOCKER-USER | grep WINGS-EGRESS
