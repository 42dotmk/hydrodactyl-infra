import { test } from "node:test";
import assert from "node:assert/strict";
import { createPoller } from "../src/poller.js";

const servers = ["cs-classic", "cs-gungame", "cs-deathrun", "hl2dm", "samp", "minecraft"].map((id, i) => ({
    id, name: id, type: "counterstrike16", host: "192.168.101.39", port: 27015 + i,
}));
const state = { map: "m", numplayers: 1, maxplayers: 8, bots: [], players: [] };
const fixedNow = () => new Date("2026-10-21T12:00:00.000Z");

test("snapshot before first poll is all offline with updatedAt null", () => {
    const poller = createPoller({ servers, query: async () => state, timeoutMs: 50 });
    const snap = poller.snapshot();
    assert.equal(snap.updatedAt, null);
    assert.equal(snap.servers.length, 6);
    assert.ok(snap.servers.every((s) => s.online === false && s.checkedAt === null));
    assert.deepEqual(snap.summary, { online: 0, total: 6, players: 0 });
});

test("pollOnce fills statuses and updatedAt", async () => {
    const poller = createPoller({ servers, query: async () => state, timeoutMs: 50, now: fixedNow });
    await poller.pollOnce();
    const snap = poller.snapshot();
    assert.equal(snap.updatedAt, "2026-10-21T12:00:00.000Z");
    assert.ok(snap.servers.every((s) => s.online === true));
    assert.deepEqual(snap.servers.map((s) => s.id), servers.map((s) => s.id));
});

test("query rejection marks only that server offline", async () => {
    const query = async (server) => {
        if (server.id === "cs-gungame") throw new Error("timeout");
        return state;
    };
    const poller = createPoller({ servers, query, timeoutMs: 50 });
    await poller.pollOnce();
    for (const s of poller.snapshot().servers) assert.equal(s.online, s.id !== "cs-gungame", s.id);
});

test("hanging query does not block the poll", async () => {
    const query = (server) => (server.id === "hl2dm" ? new Promise(() => {}) : Promise.resolve(state));
    const poller = createPoller({ servers, query, timeoutMs: 50 });
    const started = Date.now();
    await poller.pollOnce();
    assert.ok(Date.now() - started < 500, "poll took too long");
    const hl2 = poller.snapshot().servers.find((s) => s.id === "hl2dm");
    assert.equal(hl2.online, false);
});

test("polls run concurrently", async () => {
    const query = () => new Promise((resolve) => setTimeout(() => resolve(state), 40));
    const poller = createPoller({ servers, query, timeoutMs: 1000 });
    const started = Date.now();
    await poller.pollOnce();
    assert.ok(Date.now() - started < 150, "queries ran sequentially");
});

test("queryCount counts only real queries", async () => {
    const poller = createPoller({ servers, query: async () => state, timeoutMs: 50 });
    await poller.pollOnce();
    assert.equal(poller.queryCount(), 6);
    for (let i = 0; i < 100; i++) poller.snapshot();
    assert.equal(poller.queryCount(), 6);
});
