# Run: python3 -m unittest discover -s games/cs16/stats   (from the repo root)
import json
import os
import struct
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

import lan_stats


def record(name, unique=None, tks=0, damage=0, deaths=0, kills=0, shots=0, hits=0, hs=0):
    """One csstats.dat (RANK_VERSION 11) entry, as CSX's RankSystem::saveRank writes it."""
    def text(s):
        raw = s.encode("utf-8") + b"\0"
        return struct.pack("<h", len(raw)) + raw
    ints = [tks, damage, deaths, kills, shots, hits, hs, 0, 0, 0, 0] + [0] * 9
    return text(name) + text(unique if unique is not None else name) + struct.pack("<20i", *ints)


def csstats(*records, version=11):
    return struct.pack("<h", version) + b"".join(records) + struct.pack("<h", 0)


class ParseTest(unittest.TestCase):
    def test_reads_every_player_with_kills_deaths_and_score(self):
        data = csstats(record("telenoodle", kills=30, deaths=10, tks=1, hs=12, shots=400, hits=120, damage=3100),
                       record("newbie", kills=2, deaths=9))
        players = lan_stats.parse(data)
        self.assertEqual([p["name"] for p in players], ["telenoodle", "newbie"])
        top = players[0]
        self.assertEqual((top["kills"], top["deaths"], top["teamkills"], top["headshots"]), (30, 10, 1, 12))
        self.assertEqual((top["shots"], top["hits"], top["damage"]), (400, 120, 3100))
        self.assertEqual(top["score"], 30 - 10 - 1, "same formula as csstats.amxx get_score")

    def test_ranks_by_score_then_kills_like_the_in_game_top15(self):
        data = csstats(record("a", kills=5, deaths=5), record("b", kills=9, deaths=2), record("c", kills=12, deaths=9))
        self.assertEqual([p["name"] for p in lan_stats.parse(data)], ["b", "c", "a"])

    def test_empty_file_and_fresh_four_byte_file_have_no_players(self):
        self.assertEqual(lan_stats.parse(b""), [])
        self.assertEqual(lan_stats.parse(csstats()), [])

    def test_unknown_version_is_refused_not_misread(self):
        with self.assertRaises(ValueError):
            lan_stats.parse(csstats(record("x", kills=1), version=10))

    def test_truncated_file_keeps_the_complete_records(self):
        data = csstats(record("whole", kills=3), record("cut", kills=4))
        self.assertEqual([p["name"] for p in lan_stats.parse(data[:-30])], ["whole"])

    def test_odd_bytes_in_names_do_not_break_parsing(self):
        raw = struct.pack("<h", 2) + b"\xff\0"
        data = struct.pack("<h", 11) + raw + raw + struct.pack("<20i", *([0, 0, 0, 1] + [0] * 16)) + struct.pack("<h", 0)
        (player,) = lan_stats.parse(data)
        self.assertEqual(player["kills"], 1)
        self.assertIsInstance(player["name"], str)


class SnapshotTest(unittest.TestCase):
    def test_snapshot_lists_each_server_top_players_and_file_time(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "csstats.dat")
            with open(path, "wb") as f:
                f.write(csstats(*[record(f"p{i}", kills=i) for i in range(20)]))
            os.utime(path, (1_800_000_000, 1_800_000_000))
            snap = lan_stats.snapshot({"cs-classic": path, "cs-gungame": os.path.join(d, "missing.dat")}, top=15)
        classic, gungame = snap["servers"]
        self.assertEqual(classic["id"], "cs-classic")
        self.assertEqual(len(classic["players"]), 15)
        self.assertEqual(classic["players"][0]["name"], "p19")
        self.assertEqual(classic["totalPlayers"], 20)
        self.assertEqual(classic["savedAt"], "2027-01-15T08:00:00Z")
        self.assertEqual(gungame, {"id": "cs-gungame", "players": [], "totalPlayers": 0, "savedAt": None, "error": "no stats file"})


class HttpTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        path = os.path.join(self.dir.name, "csstats.dat")
        with open(path, "wb") as f:
            f.write(csstats(record("telenoodle", kills=3)))
        self.server = lan_stats.make_server("127.0.0.1", 0, {"cs-classic": path})
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.dir.cleanup()

    def test_serves_stats_json(self):
        with urllib.request.urlopen(f"{self.base}/stats.json") as res:
            self.assertEqual(res.headers["Content-Type"], "application/json")
            body = json.load(res)
        self.assertEqual(body["servers"][0]["players"][0]["name"], "telenoodle")

    def test_everything_else_is_404(self):
        for path in ["/", "/csstats.dat", "/stats.json/../x", "/../etc/passwd"]:
            with self.assertRaises(urllib.error.HTTPError) as err:
                urllib.request.urlopen(f"{self.base}{path}")
            self.assertEqual(err.exception.code, 404, path)
            err.exception.close()


if __name__ == "__main__":
    unittest.main()
