import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { toStatus, summarize, initialStatus } from "../src/status.js";

const cs = { id: "cs-classic", name: "CS 1.6 Classic", type: "counterstrike16", host: "192.168.101.39", port: 27015 };

test("online server maps gamedig state, bots counted separately", () => {
    const s = toStatus(cs, { map: "fy_pool_day", numplayers: 12, maxplayers: 20, bots: [{}, {}, {}], players: [] }, "2026-10-21T12:00:00.000Z");
    assert.deepEqual(s, {
        id: "cs-classic", name: "CS 1.6 Classic", game: "counterstrike16", address: "192.168.101.39:27015",
        online: true, map: "fy_pool_day", players: 9, bots: 3, maxPlayers: 20, checkedAt: "2026-10-21T12:00:00.000Z",
    });
});

test("null result is offline with null details", () => {
    const s = toStatus(cs, null, "2026-10-21T12:00:00.000Z");
    assert.equal(s.online, false);
    assert.equal(s.map, null);
    assert.equal(s.players, null);
    assert.equal(s.checkedAt, "2026-10-21T12:00:00.000Z");
});

test("missing numplayers falls back to players array length", () => {
    assert.equal(toStatus(cs, { map: "x", players: [{}, {}], bots: [], maxplayers: 10 }, "t").players, 2);
});

test("status never contains player names", () => {
    const s = toStatus(cs, { map: "x", numplayers: 1, maxplayers: 10, players: [{ name: "alice" }], bots: [] }, "t");
    assert.ok(!JSON.stringify(s).includes("alice"));
});

test("summarize counts online servers and humans only", () => {
    const a = toStatus(cs, { map: "m", numplayers: 5, maxplayers: 20, bots: [{}, {}], players: [] }, "t");
    const b = toStatus({ ...cs, id: "x" }, null, "t");
    assert.deepEqual(summarize([a, b]), { online: 1, total: 2, players: 3 });
});

test("initialStatus is offline and unchecked", () => {
    assert.deepEqual(initialStatus(cs), { ...toStatus(cs, null, null), checkedAt: null });
});

test("servers.json lists the six servers with valid fields", async () => {
    const servers = JSON.parse(await readFile(new URL("../servers.json", import.meta.url)));
    assert.equal(servers.length, 6);
    for (const s of servers) {
        assert.match(s.id, /^[a-z0-9-]+$/);
        assert.ok(Number.isInteger(s.port));
        assert.ok(s.type && s.host && s.name);
    }
});
