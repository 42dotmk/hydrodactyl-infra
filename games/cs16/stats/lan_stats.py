#!/usr/bin/env python3
"""All-time CS 1.6 leaderboards for lan.apps.42.mk, read from AMX Mod X CSX's csstats.dat.

Serves GET /stats.json only. Each request re-reads the stats files (a few KB; CSX rewrites them at
every map change), so there is no state to go stale. Runs on wings-01 as a sandboxed systemd service
(lan-stats.service, written by install.sh) that sees each server's amxmodx/data directory read-only.

usage: lan_stats.py --listen 192.168.101.39:8790 cs-classic=/path/csstats.dat [cs-gungame=...]
"""
import argparse
import datetime
import json
import os
import struct
from http.server import BaseHTTPRequestHandler, HTTPServer

RANK_VERSION = 11  # CSX RankSystem::saveRank (modules/cstrike/csx/CRank.cpp)
# per player after name and unique: tks, damage, deaths, kills, shots, hits, hs,
# bDefusions, bDefused, bPlants, bExplosions, bodyHits[9]
INTS = struct.Struct("<20i")
SHORT = struct.Struct("<h")


def parse(data):
    """Players in a csstats.dat, best first (score = kills - deaths - teamkills, as csstats.amxx ranks)."""
    if len(data) < SHORT.size:
        return []
    (version,) = SHORT.unpack_from(data, 0)
    if version != RANK_VERSION:
        raise ValueError(f"csstats.dat version {version}, expected {RANK_VERSION}")
    players, pos = [], SHORT.size

    def text(at):
        (length,) = SHORT.unpack_from(data, at)
        end = at + SHORT.size + length
        if length <= 0 or end > len(data):
            raise IndexError
        return data[at + SHORT.size:end].split(b"\0", 1)[0].decode("utf-8", "replace"), end

    while pos + SHORT.size <= len(data):
        try:
            if SHORT.unpack_from(data, pos)[0] == 0:
                break  # terminator
            name, pos = text(pos)
            _unique, pos = text(pos)
            if pos + INTS.size > len(data):
                break
            tks, damage, deaths, kills, shots, hits, hs, *_ = INTS.unpack_from(data, pos)
            pos += INTS.size
        except (IndexError, struct.error):
            break  # truncated mid-record: keep what was complete
        players.append({"name": name, "score": kills - deaths - tks, "kills": kills, "deaths": deaths,
                        "teamkills": tks, "headshots": hs, "shots": shots, "hits": hits, "damage": damage})
    players.sort(key=lambda p: (-p["score"], -p["kills"], p["name"]))
    return players


def snapshot(files, top=15):
    servers = []
    for server_id, path in files.items():
        entry = {"id": server_id, "players": [], "totalPlayers": 0, "savedAt": None}
        try:
            with open(path, "rb") as f:
                data = f.read(4 * 1024 * 1024)
            mtime = os.stat(path).st_mtime
        except FileNotFoundError:
            servers.append({**entry, "error": "no stats file"})
            continue
        try:
            players = parse(data)
        except ValueError as err:
            servers.append({**entry, "error": str(err)})
            continue
        saved = datetime.datetime.fromtimestamp(mtime, datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        servers.append({**entry, "players": players[:top], "totalPlayers": len(players), "savedAt": saved})
    return {"generatedAt": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "servers": servers}


def make_server(host, port, files, top=15):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != "/stats.json":
                return self.reply(404, "text/plain", b"not found")
            self.reply(200, "application/json", json.dumps(snapshot(files, top)).encode())

        def reply(self, status, content_type, body):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass  # journald gets errors only

    return HTTPServer((host, port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--listen", required=True, help="host:port")
    parser.add_argument("--top", type=int, default=15)
    parser.add_argument("servers", nargs="+", help="id=/path/to/csstats.dat")
    args = parser.parse_args()
    host, port = args.listen.rsplit(":", 1)
    files = dict(s.split("=", 1) for s in args.servers)
    make_server(host, int(port), files, args.top).serve_forever()


if __name__ == "__main__":
    main()
