# Run: python3 -m unittest discover -s games/cs16/fastdl   (from the repo root)
import http.client
import os
import tempfile
import threading
import unittest

import fastdl


def write(root, rel, data=b"x"):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


class FastDLTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = os.path.join(cls.tmp.name, "biohazard")
        for rel in ["maps/zm_italy.bsp", "maps/zm_italy.res", "maps/zm_italy.txt", "models/player/slum/slum.mdl",
                    "sound/biohazard/scream1.wav", "gfx/env/italybk.tga", "sprites/flare.spr", "overviews/zm_italy.bmp",
                    "zm_boatescape.wad", "server.cfg", "reunion.cfg", "addons/amxmodx/configs/users.ini", "maps/evil.cfg",
                    "maps/.hidden.bsp", "liblist.gam"]:
            write(root, rel, rel.encode())
        write(cls.tmp.name, "outside.bsp", b"secret")
        os.symlink(os.path.join(cls.tmp.name, "outside.bsp"), os.path.join(root, "maps", "escape.bsp"))
        cls.server = fastdl.make_server("127.0.0.1", 0, {"biohazard": root})
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    def request(self, path, method="GET"):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request(method, path)  # raw path: no client-side normalisation
        res = conn.getresponse()
        body = res.read()
        conn.close()
        return res.status, res.headers, body

    def test_serves_downloadable_game_files(self):
        for rel in ["maps/zm_italy.bsp", "maps/zm_italy.res", "maps/zm_italy.txt", "models/player/slum/slum.mdl",
                    "sound/biohazard/scream1.wav", "gfx/env/italybk.tga", "sprites/flare.spr",
                    "overviews/zm_italy.bmp", "zm_boatescape.wad"]:
            status, headers, body = self.request(f"/biohazard/{rel}")
            self.assertEqual((status, body), (200, rel.encode()), rel)
            self.assertEqual(headers["Content-Length"], str(len(rel)), rel)

    def test_tolerates_the_double_slash_a_trailing_slash_url_produces(self):
        self.assertEqual(self.request("/biohazard//maps/zm_italy.bsp")[0], 200)

    def test_head_gives_the_size_without_the_body(self):
        status, headers, body = self.request("/biohazard/maps/zm_italy.bsp", "HEAD")
        self.assertEqual((status, headers["Content-Length"], body), (200, str(len("maps/zm_italy.bsp")), b""))

    def test_never_serves_configs_addons_or_anything_outside_the_asset_dirs(self):
        for path in ["/biohazard/server.cfg", "/biohazard/reunion.cfg", "/biohazard/liblist.gam",
                     "/biohazard/addons/amxmodx/configs/users.ini", "/biohazard/maps/evil.cfg",
                     "/biohazard/maps/.hidden.bsp", "/biohazard/maps/../server.cfg", "/biohazard/%2e%2e/outside.bsp",
                     "/biohazard/maps/%2e%2e/server.cfg", "/biohazard/maps/escape.bsp", "/biohazard/maps/",
                     "/biohazard/maps", "/biohazard/", "/classic/maps/zm_italy.bsp", "/", "/biohazard/maps/a\\b.bsp",
                     "/biohazard/maps/zm_italy.bsp%00.cfg"]:
            self.assertEqual(self.request(path)[0], 404, path)

    def test_only_get_and_head(self):
        self.assertEqual(self.request("/biohazard/maps/zm_italy.bsp", "POST")[0], 405)


if __name__ == "__main__":
    unittest.main()
