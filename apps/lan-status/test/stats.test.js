import { test } from "node:test";
import assert from "node:assert/strict";
import { createStatsPoller } from "../src/stats.js";
import { createServer } from "../src/server.js";
import { kdText, hsText, savedText } from "../public/render.js";

const servers = [
    { id: "cs-classic", name: "CS 1.6 Classic", type: "counterstrike16" },
    { id: "cs-gungame", name: "CS 1.6 GunGame", type: "counterstrike16" },
    { id: "hl2dm", name: "Half-Life 2: Deathmatch", type: "hl2d" },
];
const player = (name, extra = {}) => ({ name, score: 10, kills: 14, deaths: 4, teamkills: 0, headshots: 5, shots: 300, hits: 90, damage: 2000, ...extra });
const upstream = {
    generatedAt: "2026-10-22T09:00:00Z",
    servers: [
        { id: "cs-gungame", players: [], totalPlayers: 0, savedAt: "2026-10-22T08:45:24Z" },
        { id: "cs-classic", players: [player("telenoodle"), player("newbie", { score: -3 })], totalPlayers: 2, savedAt: "2026-10-22T08:31:54Z" },
        { id: "cs-unknown", players: [player("x")], totalPlayers: 1, savedAt: null },
    ],
};
const fixedNow = () => new Date("2026-10-22T09:00:05.000Z");
const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test("before the first poll there are no boards and no update time", () => {
    const poller = createStatsPoller({ url: "http://x/stats.json", servers, fetchImpl: ok(upstream) });
    assert.deepEqual(poller.snapshot(), { updatedAt: null, failed: false, servers: [] });
});

test("a poll keeps this site's CS servers, in servers.json order, with their names", async () => {
    const poller = createStatsPoller({ url: "http://x/stats.json", servers, fetchImpl: ok(upstream), now: fixedNow });
    await poller.pollOnce();
    const snap = poller.snapshot();
    assert.equal(snap.updatedAt, "2026-10-22T09:00:05.000Z");
    assert.equal(snap.failed, false);
    assert.deepEqual(snap.servers.map((s) => [s.id, s.name]), [["cs-classic", "CS 1.6 Classic"], ["cs-gungame", "CS 1.6 GunGame"]]);
    const classic = snap.servers[0];
    assert.equal(classic.savedAt, "2026-10-22T08:31:54Z");
    assert.equal(classic.totalPlayers, 2);
    assert.deepEqual(classic.players[0], { name: "telenoodle", score: 10, kills: 14, deaths: 4, headshots: 5, shots: 300, hits: 90 });
});

test("upstream values are cleaned: long names cut, bad numbers and entries dropped, at most 15 players", async () => {
    const messy = { servers: [{ id: "cs-classic", savedAt: "not a date", totalPlayers: "lots", players: [
        player("a".repeat(80)), { name: 42, kills: 1 }, player("nan", { kills: "1e9" }), "junk",
        ...Array.from({ length: 30 }, (_, i) => player(`p${i}`)),
    ] }] };
    const poller = createStatsPoller({ url: "http://x/stats.json", servers, fetchImpl: ok(messy), now: fixedNow });
    await poller.pollOnce();
    const classic = poller.snapshot().servers[0];
    assert.equal(classic.players.length, 15);
    assert.equal(classic.players[0].name, "a".repeat(32));
    assert.ok(classic.players.every((p) => typeof p.name === "string" && Number.isInteger(p.kills)));
    assert.equal(classic.savedAt, null);
    assert.equal(classic.totalPlayers, 15);
});

test("a failed or slow poll keeps the last good boards and says so", async () => {
    let fail = false;
    const fetchImpl = async (url, { signal }) => {
        if (!fail) return ok(upstream)();
        return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    const poller = createStatsPoller({ url: "http://x/stats.json", servers, fetchImpl, timeoutMs: 50, now: fixedNow });
    await poller.pollOnce();
    fail = true;
    await poller.pollOnce();
    const snap = poller.snapshot();
    assert.equal(snap.failed, true);
    assert.equal(snap.updatedAt, "2026-10-22T09:00:05.000Z");
    assert.equal(snap.servers[0].players[0].name, "telenoodle");
});

test("an HTTP error from the exporter counts as a failed poll", async () => {
    const poller = createStatsPoller({ url: "http://x/stats.json", servers, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    await poller.pollOnce();
    assert.deepEqual(poller.snapshot(), { updatedAt: null, failed: true, servers: [] });
});

test("GET /api/stats serves the stats snapshot uncached; without stats it is a 404", async () => {
    const stats = { snapshot: () => ({ updatedAt: null, failed: false, servers: [] }) };
    const poller = { snapshot: () => ({}) };
    const publicDir = new URL("../public/", import.meta.url);
    for (const [opts, expected] of [[{ stats }, 200], [{}, 404]]) {
        const server = createServer({ poller, publicDir, ...opts });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/stats`);
        assert.equal(res.status, expected);
        if (expected === 200) {
            assert.equal(res.headers.get("cache-control"), "no-store");
            assert.deepEqual(await res.json(), stats.snapshot());
        }
        server.close();
    }
});

test("K/D, headshot share and save time read like a scoreboard", () => {
    assert.equal(kdText(14, 4), "3.50");
    assert.equal(kdText(7, 0), "7.00");
    assert.equal(kdText(0, 0), "0.00");
    assert.equal(hsText(5, 14), "36%");
    assert.equal(hsText(0, 0), "—");
    assert.equal(savedText(null), "no games recorded yet");
    assert.match(savedText("2026-10-22T08:31:54Z"), /^saved at map change, \d{2}:\d{2}$/);
});
