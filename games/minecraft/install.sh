#!/bin/bash
# Installs the pinned plugins into the Minecraft server volume and points squaremap's web server at
# the map port. Runs as root on wings-01 (see deploy.sh). Idempotent; restart the server afterwards.
# squaremap writes its config on first start, so a fresh install needs: deploy, restart, deploy, restart.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
SERVER_UUID=0984e9dc-f1b1-4979-84ba-ac1d1a12d334   # Hydrodactyl server "Minecraft" (192.168.101.39:25565)
MAP_PORT=25566                                      # its second allocation; proxied by lan.apps.42.mk/map/
MAP_URL=https://lan.apps.42.mk/map/
MC=/var/lib/pterodactyl/volumes/$SERVER_UUID
CACHE=/var/cache/minecraft-plugins
[ -f "$MC/server.properties" ] || { echo "$MC is not a Minecraft server volume" >&2; exit 1; }
mkdir -p "$CACHE" "$MC/plugins"

log() { printf '==> %s\n' "$*"; }

grep -vE '^\s*(#|$)' "$HERE/plugins.lock" | while read -r jar sha url; do
    cached=$CACHE/$jar
    [ -f "$cached" ] || { curl -fsSL -o "$cached.part" "$url"; mv "$cached.part" "$cached"; }
    echo "$sha  $cached" | sha512sum -c --quiet - || { rm -f "$cached"; echo "$jar: sha512 mismatch" >&2; exit 1; }
    # drop other versions of the same plugin (name up to the first "-")
    find "$MC/plugins" -maxdepth 1 -name "${jar%%-*}-*.jar" ! -name "$jar" -print -delete
    install -o pterodactyl -g pterodactyl -m 644 "$cached" "$MC/plugins/$jar"
    log "plugin $jar"
done

CFG=$MC/plugins/squaremap/config.yml
if [ -f "$CFG" ]; then
    # listen on the map allocation inside the container; web-address is what squaremap links to
    python3 - "$CFG" "$MAP_PORT" "$MAP_URL" <<'PY'
import sys
path, port, url = sys.argv[1:4]
lines = open(path).read().split("\n")

def set_key(section, key, value):
    """Set settings.<section>.<key> (or settings.<key> when section is None), whatever the indentation."""
    indent_of = lambda l: len(l) - len(l.lstrip(" "))
    start = next(i for i, l in enumerate(lines) if l.strip() == "settings:")
    top = indent_of(lines[start])
    if section:
        start = next(i for i in range(start + 1, len(lines)) if lines[i].strip() == f"{section}:")
        top = indent_of(lines[start])
    for i in range(start + 1, len(lines)):
        l = lines[i]
        if l.strip() and indent_of(l) <= top:
            break
        if l.strip().startswith(f"{key}:") and indent_of(l) > top:
            lines[i] = f"{' ' * indent_of(l)}{key}: {value}"
            return
    sys.exit(f"squaremap config: {section}.{key} not found")

set_key("internal-webserver", "enabled", "true")
set_key("internal-webserver", "bind", "0.0.0.0")
set_key("internal-webserver", "port", port)
set_key(None, "web-address", url)
open(path, "w").write("\n".join(lines))
PY
    chown pterodactyl:pterodactyl "$CFG"
    log "squaremap web server on :$MAP_PORT"
else
    log "squaremap has not written its config yet: restart the server, then deploy again"
fi
log "done (restart the Minecraft server to load changes)"
