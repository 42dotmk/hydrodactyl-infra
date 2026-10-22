#!/bin/bash
# Builds and installs a CS 1.6 mod stack into a Pterodactyl server volume on the Wings node.
# Runs as root on wings-01 (see deploy.sh, started by `mise run cs16:deploy <mode>` on base42).
#
#   ReHLDS (from the egg) + ReGameDLL + Metamod-R + ReUnion + AMX Mod X + ReAPI [+ YaPB]
#   + mode plugins compiled from pinned sources + maps from maps.lock
#
# Safe while the server runs: files are replaced as new inodes, the restart picks them up.
# Never overwritten once present: reunion.cfg (salt) and amxmodx/configs/users.ini, except that the
# admin's password is set to the shared one from deploy.sh (ADMIN_PASSWORD_FILE) when given.
set -euo pipefail

MODE=${1:?usage: build.sh <mode>}
HERE=$(cd "$(dirname "$0")" && pwd)
ENV_FILE=$HERE/modes/$MODE.env
[ -f "$ENV_FILE" ] || { echo "unknown mode '$MODE'" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
[ -n "${SERVER_UUID:-}" ] || { echo "SERVER_UUID is not set in modes/$MODE.env" >&2; exit 1; }

VOL=/var/lib/pterodactyl/volumes/$SERVER_UUID
CS=$VOL/cstrike
[ -x "$VOL/hlds_linux" ] || { echo "$VOL is not an installed HLDS server" >&2; exit 1; }

ADMIN_NAME=${ADMIN_NAME:-telenoodle}
CACHE=/var/cache/cs16-build
COMPILER_IMAGE=ghcr.io/parkervcp/games:source   # has the 32-bit libs amxxpc needs
UNPACK_IMAGE=alpine:3.22                        # bsdtar for the .rar map archives
RAR_IMAGE=debian:13-slim                        # unar: bsdtar and 7-Zip fail on the Biohazard RAR
WORK=$(mktemp -d /tmp/cs16-build.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
OUT=$WORK/cstrike
mkdir -p "$CACHE" "$OUT"

log() { printf '==> %s\n' "$*"; }

# fetch <name>: download a sources.lock entry into the cache and verify its sha256
fetch() {
    local line sha url file
    line=$(grep -E "^$1[[:space:]]" "$HERE/sources.lock") || { echo "$1 not in sources.lock" >&2; exit 1; }
    read -r _ sha url <<<"$line"
    file=$CACHE/$sha
    if [ ! -f "$file" ]; then curl -fsSL -o "$file.part" "$url"; mv "$file.part" "$file"; fi
    echo "$sha  $file" | sha256sum -c --quiet - || { rm -f "$file"; echo "$1: sha256 mismatch" >&2; exit 1; }
    echo "$file"
}
unzip_to() { python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"; }

# setcfg <file> <cvar> <value>: set or append a cvar line
setcfg() {
    touch "$1"
    if grep -qE "^[[:space:]]*$2([[:space:]]|$)" "$1"; then sed -i -E "s#^[[:space:]]*$2([[:space:]].*)?\$#$2 $3#" "$1"
    else printf '%s %s\n' "$2" "$3" >>"$1"; fi
}

# --- base stack ---------------------------------------------------------------
log "base stack"
# (fetch results go through variables so a failed download/hash check stops the script)
f=$(fetch regamedll); unzip_to "$f" "$WORK/regamedll"; cp -a "$WORK/regamedll/bin/linux32/cstrike/." "$OUT/"
f=$(fetch metamod); unzip_to "$f" "$OUT"
f=$(fetch amxx-base); tar -xzf "$f" -C "$OUT"
f=$(fetch amxx-cstrike); tar -xzf "$f" -C "$OUT"
f=$(fetch reapi); unzip_to "$f" "$OUT"
f=$(fetch reunion); unzip_to "$f" "$WORK/reunion"
install -D -m 755 "$WORK/reunion/bin/Linux/reunion_mm_i386.so" "$OUT/addons/reunion/reunion_mm_i386.so"
if [ "${BOTS:-0}" = 1 ]; then f=$(fetch yapb); tar -xJf "$f" -C "$OUT"; fi

# --- mode plugins (sources -> scripting/, assets -> their game paths) -----------
SCRIPTING=$OUT/addons/amxmodx/scripting
case $MODE in
    gungame)
        f=$(fetch src-gungame); mkdir -p "$WORK/src"; tar -xzf "$f" -C "$WORK/src" --strip-components=1
        cp "$WORK/src/scripting/gungame.sma" "$SCRIPTING/"
        cp "$WORK/src/configs/gungame.cfg" "$OUT/addons/amxmodx/configs/"
        cp "$WORK/src/data/lang/gungame.txt" "$OUT/addons/amxmodx/data/lang/"
        mkdir -p "$OUT/sound"; cp -a "$WORK/src/resources/sound/." "$OUT/sound/"
        ;;
    deathrun)
        f=$(fetch src-deathrun); mkdir -p "$WORK/src"; tar -xzf "$f" -C "$WORK/src" --strip-components=1
        cp -a "$WORK/src/addons/amxmodx/scripting/." "$SCRIPTING/"
        cp -a "$WORK/src/addons/amxmodx/data/." "$OUT/addons/amxmodx/data/"
        ;;
    biohazard)
        f=$(fetch src-biohazard); mkdir -p "$WORK/src"
        docker run --rm -v "$f:/a.rar:ro" -v "$WORK/src:/x" "$RAR_IMAGE" sh -c \
            'apt-get update -qq >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unar >/dev/null && unar -q -D -o /x /a.rar >/dev/null'
        # Sources only: the archive's prebuilt plugins/*.amxx are skipped, and so are plugins-bio.ini
        # (PLUGINS lists what loads) and the csdm/ spawn files (bh_randomspawn stays 0).
        # scripting/biohazard.cfg is the compile-time #tryinclude with models, sounds and weapon menus.
        cp -a "$WORK/src/addons/amxmodx/scripting/." "$SCRIPTING/"
        cp "$WORK/src/addons/amxmodx/configs/bh_cvars.cfg" "$WORK/src/addons/amxmodx/configs/bh_zombieclass.ini" "$OUT/addons/amxmodx/configs/"
        cp "$WORK/src/addons/amxmodx/data/lang/biohazard.txt" "$OUT/addons/amxmodx/data/lang/"
        cp -a "$WORK/src/models" "$WORK/src/sound" "$OUT/"
        ;;
esac
for plugin in ${PLUGINS:-}; do
    sma=${plugin%.amxx}.sma
    log "compiling $sma"
    docker run --rm --network none -u "$(id -u):$(id -g)" -v "$OUT/addons/amxmodx:/a" -w /a/scripting --entrypoint ./amxxpc \
        "$COMPILER_IMAGE" "$sma" "-o../plugins/$plugin" | grep -v -E '^(AMX Mod X Compiler|Copyright|Portions)' || true
    [ -s "$OUT/addons/amxmodx/plugins/$plugin" ] || { echo "compile failed: $sma" >&2; exit 1; }
done

# --- maps ---------------------------------------------------------------------
for map in ${MAPS:-}; do
    [ -f "$CS/maps/$map.bsp" ] && continue
    entry=$(grep -E "^$map[[:space:]]" "$HERE/maps.lock") || { echo "$map not in maps.lock" >&2; exit 1; }
    read -r _ md5 url <<<"$entry"
    log "map $map"
    archive=$CACHE/map-$md5
    [ -f "$archive" ] || curl -fsSL -o "$archive" "$url"
    echo "$md5  $archive" | md5sum -c --quiet - || { rm -f "$archive"; echo "$map: md5 mismatch" >&2; exit 1; }
    mkdir -p "$WORK/map-$map"
    # bsdtar (alpine) reads zip and rar; the archive is mounted read-only and only /x is writable
    docker run --rm -v "$archive:/a:ro" -v "$WORK/map-$map:/x" "$UNPACK_IMAGE" \
        sh -c 'apk add -q --no-cache libarchive-tools >/dev/null && bsdtar -xf /a -C /x' 
    python3 -I "$HERE/tools/stage_map.py" "$WORK/map-$map" "$OUT" "$CS" "$VOL/valve"
done

# --- install --------------------------------------------------------------------
log "installing into $CS"
# Keep server-specific state; everything else in the stack is managed by this script.
PRESERVE=(addons/amxmodx/configs/users.ini)
for p in "${PRESERVE[@]}"; do [ -f "$CS/$p" ] && rm -f "$OUT/$p"; done
(cd "$OUT" && find . -type d -exec mkdir -p "$CS/{}" \; && find . -type f -exec cp --remove-destination {} "$CS/{}" \;)

# Engine -> Metamod -> plugins
sed -i -E 's|^gamedll_linux .*|gamedll_linux "addons/metamod/metamod_i386.so"|' "$CS/liblist.gam"
{
    echo "linux addons/reunion/reunion_mm_i386.so"
    echo "linux addons/amxmodx/dlls/amxmodx_mm_i386.so"
    [ "${BOTS:-0}" = 1 ] && echo "linux addons/yapb/bin/yapb.so"
} >"$CS/addons/metamod/plugins.ini"

# ReUnion: accept non-Steam clients; the SteamID salt is generated once per server
if [ ! -f "$CS/reunion.cfg" ]; then
    sed -E "s|^SteamIdHashSalt =.*|SteamIdHashSalt = $(openssl rand -hex 24)|" "$WORK/reunion/reunion.cfg" >"$CS/reunion.cfg"
fi

# AMXX admin by name + password (SteamIDs are not trustworthy with non-Steam clients)
USERS=$CS/addons/amxmodx/configs/users.ini
ADMIN_PASSWORD=$( [ -s "${ADMIN_PASSWORD_FILE:-}" ] && tr -d '\r\n' <"$ADMIN_PASSWORD_FILE" || true)
case $ADMIN_PASSWORD in *[\"\\\|\&]*) echo "admin password must not contain \" \\ | or &" >&2; exit 1 ;; esac
if ! grep -q "^\"$ADMIN_NAME\"" "$USERS"; then
    printf '"%s" "%s" "abcdefghijklmnopqrstu" "a"\n' "$ADMIN_NAME" "${ADMIN_PASSWORD:-$(openssl rand -hex 8)}" >>"$USERS"
    log "created admin '$ADMIN_NAME' - password is in cstrike/addons/amxmodx/configs/users.ini (panel file manager)"
elif [ -n "$ADMIN_PASSWORD" ]; then
    sed -i -E "s|^(\"$ADMIN_NAME\" )\"[^\"]*\"|\\1\"$ADMIN_PASSWORD\"|" "$USERS"
fi
for plugin in ${PLUGINS:-}; do grep -qx "$plugin" "$CS/addons/amxmodx/configs/plugins.ini" || echo "$plugin" >>"$CS/addons/amxmodx/configs/plugins.ini"; done

# Map rotation and server settings
printf '%s\n' ${MAPS:-} >"$CS/mapcycle.txt"
CFG=$CS/server.cfg
setcfg "$CFG" hostname "\"$HOSTNAME\""
setcfg "$CFG" sv_lan 1
setcfg "$CFG" mapcyclefile '"mapcycle.txt"'
if [ "${BOTS:-0}" = 1 ]; then
    setcfg "$CFG" yb_quota "$BOT_QUOTA"
    setcfg "$CFG" yb_quota_mode '"fill"'
else
    sed -i -E '/^[[:space:]]*yb_/d' "$CFG"
fi

chown -R pterodactyl:pterodactyl "$CS"
log "done: $MODE -> $SERVER_UUID (restart the server to load it)"
