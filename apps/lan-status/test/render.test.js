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

import { freshness, summaryText, updatedText } from "../public/render.js";

const NOW = Date.parse("2026-10-21T12:03:00.000Z");
const snap = (updatedAt) => ({ updatedAt, summary: { online: 5, total: 6, players: 3 } });

test("freshness: pending before the first poll, fresh within 45 s, stale after, unreachable on fetch failure", () => {
    assert.equal(freshness({ updatedAt: null, fetchFailed: false }, NOW), "pending");
    assert.equal(freshness({ updatedAt: "2026-10-21T12:02:30.000Z", fetchFailed: false }, NOW), "fresh");
    assert.equal(freshness({ updatedAt: "2026-10-21T12:02:00.000Z", fetchFailed: false }, NOW), "stale");
    assert.equal(freshness({ updatedAt: "2026-10-21T12:02:59.000Z", fetchFailed: true }, NOW), "unreachable");
});

test("summary says status unknown when the data cannot be trusted", () => {
    assert.equal(summaryText(snap("t"), "fresh"), "5 of 6 servers online · 3 players");
    assert.equal(summaryText(snap(null), "pending"), "checking servers…");
    assert.equal(summaryText(snap("t"), "stale"), "status unknown");
    assert.equal(summaryText(snap("t"), "unreachable"), "status unknown");
});

test("the age of the data stays visible when it is stale or the service is unreachable", () => {
    assert.equal(updatedText("2026-10-21T12:02:55.000Z", "fresh", NOW), "updated 5s ago");
    assert.equal(updatedText("2026-10-21T12:00:00.000Z", "stale", NOW), "last update 3 min ago · data is stale");
    assert.equal(updatedText("2026-10-21T12:00:00.000Z", "unreachable", NOW), "last update 3 min ago · status service unreachable, retrying");
    assert.equal(updatedText(null, "unreachable", NOW), "status service unreachable, retrying");
    assert.equal(updatedText(null, "pending", NOW), "");
});

test("a single bot is not plural", () => {
    assert.equal(playersText({ online: true, players: 0, maxPlayers: 20, bots: 1 }), "0/20 + 1 bot");
});
