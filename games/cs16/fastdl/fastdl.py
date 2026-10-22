#!/usr/bin/env python3
"""HTTP fast download (sv_downloadurl) for the LAN CS 1.6 servers.

GET/HEAD /<mode>/<path> serves a downloadable game file from that mode's cstrike directory: only
maps/, models/, sound/, sprites/, gfx/ and overviews/ resources, plus .wad files at the top level.
Configs, addons/ (users.ini holds the admin password) and anything else are 404. Runs on wings-01 as a
sandboxed systemd service (cs16-fastdl.service, written by install.sh) that sees each cstrike directory
read-only, with addons/ and the config files masked as well.

usage: fastdl.py --listen 192.168.101.39:27080 biohazard=/path/to/cstrike [classic=...]
"""
import argparse
import os
import re
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ASSET_DIRS = {"maps", "models", "sound", "sprites", "gfx", "overviews"}
EXTENSIONS = {".bsp", ".res", ".wad", ".mdl", ".spr", ".wav", ".mp3", ".tga", ".bmp", ".txt"}
TEXT_DIRS = {"maps", "overviews"}  # .txt is a map description or overview layout only there
SEGMENT = re.compile(r"^[A-Za-z0-9_()\[\]!+~-][A-Za-z0-9_.()\[\]!+~-]*$")  # no leading ".", no "/", "\", "%"


def resolve(roots, raw_path):
    """The file to serve for a request path, or None."""
    if "?" in raw_path or "#" in raw_path:
        return None
    parts = re.sub(r"/+", "/", unquote(raw_path)).strip("/").split("/")
    if len(parts) < 2 or parts[0] not in roots or not all(SEGMENT.match(p) for p in parts):
        return None
    root, rel = roots[parts[0]], parts[1:]
    ext = os.path.splitext(rel[-1])[1].lower()
    if len(rel) == 1:
        if ext != ".wad":
            return None
    elif rel[0] not in ASSET_DIRS or ext not in EXTENSIONS or (ext == ".txt" and rel[0] not in TEXT_DIRS):
        return None
    real_root = os.path.realpath(root)
    real = os.path.realpath(os.path.join(real_root, *rel))
    if not real.startswith(real_root + os.sep) or not os.path.isfile(real):
        return None  # symlinks out of the tree, directories and missing files
    return real


def make_server(host, port, roots):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_GET(self):
            self.serve(body=True)

        def do_HEAD(self):
            self.serve(body=False)

        def refuse(self):
            self.send_response(405)
            self.send_header("Allow", "GET, HEAD")
            self.send_header("Content-Length", "0")
            self.end_headers()

        do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = refuse

        def serve(self, body):
            path = resolve(roots, self.path)
            if path is None:
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            with open(path, "rb") as f:
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(os.fstat(f.fileno()).st_size))
                self.end_headers()
                if body:
                    shutil.copyfileobj(f, self.wfile)

        def log_message(self, *args):
            pass  # journald gets errors only

    return ThreadingHTTPServer((host, port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--listen", required=True, help="host:port")
    parser.add_argument("servers", nargs="+", help="mode=/path/to/cstrike")
    args = parser.parse_args()
    host, port = args.listen.rsplit(":", 1)
    make_server(host, int(port), dict(s.split("=", 1) for s in args.servers)).serve_forever()


if __name__ == "__main__":
    main()
