import { test } from "node:test";
import assert from "node:assert/strict";
import { statusText, playersText } from "../public/render.js";

test("a server that has not been checked yet reads 'checking…', not offline", () => {
    assert.equal(statusText({ online: false, checkedAt: null }), "checking…");
});

test("checked servers read online or offline", () => {
    assert.equal(statusText({ online: true, checkedAt: "2026-10-21T12:00:00.000Z" }), "online");
    assert.equal(statusText({ online: false, checkedAt: "2026-10-21T12:00:00.000Z" }), "offline");
});

test("players text shows humans, max and bots", () => {
    assert.equal(playersText({ online: true, players: 2, maxPlayers: 20, bots: 8 }), "2/20 + 8 bots");
    assert.equal(playersText({ online: true, players: 3, maxPlayers: 16, bots: 0 }), "3/16");
    assert.equal(playersText({ online: false, players: null, maxPlayers: null, bots: null }), "—");
});
