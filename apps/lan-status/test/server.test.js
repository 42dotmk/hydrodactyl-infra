import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "../src/server.js";

const publicDir = new URL("../public/", import.meta.url);
const snapshot = {
    updatedAt: "2026-10-21T12:00:00.000Z",
    summary: { online: 1, total: 1, players: 2 },
    servers: [{ id: "cs-classic", name: "CS 1.6 Classic", game: "counterstrike16", address: "192.168.101.39:27015",
        online: true, map: "fy_pool_day", players: 2, bots: 8, maxPlayers: 20, checkedAt: "2026-10-21T12:00:00.000Z" }],
};
let pollCalls = 0;
const poller = { snapshot: () => snapshot, pollOnce: async () => { pollCalls++; } };

let server, base;
before(async () => {
    server = createServer({ poller, publicDir });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// fetch() normalises "/../x" away; send raw paths over a plain socket-level request instead.
async function rawGet(path) {
    const { request } = await import("node:http");
    return new Promise((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port: server.address().port, path, method: "GET" }, (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode));
        });
        req.on("error", reject);
        req.end();
    });
}

test("GET /api/status returns the snapshot as JSON", async () => {
    const res = await fetch(`${base}/api/status`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^application\/json/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), snapshot);
});

test("GET /api/status does not query servers", async () => {
    for (let i = 0; i < 20; i++) await (await fetch(`${base}/api/status`)).arrayBuffer();
    assert.equal(pollCalls, 0);
});

test("GET / serves the page with security headers", async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^text\/html/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
});

test("static assets are served with their content types", async () => {
    assert.match((await fetch(`${base}/app.js`)).headers.get("content-type"), /^text\/javascript/);
    assert.match((await fetch(`${base}/style.css`)).headers.get("content-type"), /^text\/css/);
    assert.match((await fetch(`${base}/render.js`)).headers.get("content-type"), /^text\/javascript/);
});

test("unknown and traversal paths return 404", async () => {
    for (const path of ["/servers.json", "/../package.json", "/%2e%2e/package.json", "/src/main.js", "/api/other", "/public/index.html"]) {
        assert.equal(await rawGet(path), 404, path);
    }
});

test("GET /healthz returns 200", async () => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
});

test("index.html contains no inline data", async () => {
    const html = await readFile(new URL("index.html", publicDir), "utf8");
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length >= 1, "page loads app.js");
    for (const [, attrs, body] of scripts) {
        assert.match(attrs, /src="\/app\.js"/);
        assert.equal(body.trim(), "");
    }
    assert.ok(!/https?:\/\//.test(html), "no external URLs in the page");
});
