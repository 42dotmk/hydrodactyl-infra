import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createServer } from "../src/server.js";

const publicDir = new URL("../public/", import.meta.url);
const poller = { snapshot: () => ({ updatedAt: null, summary: { online: 0, total: 0, players: 0 }, servers: [] }) };

// Stand-in for squaremap's internal web server: records every path it is asked for.
const seen = [];
const upstream = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    if (req.url === "/") return res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "x=1" }).end("<title>squaremap</title>");
    if (req.url === "/assets/index-abc.js") return res.writeHead(200, { "Content-Type": "application/javascript" }).end("console.log(1)");
    if (req.url.startsWith("/tiles/players.json")) {
        if (req.headers["if-none-match"] === '"v1"') return res.writeHead(304, { ETag: '"v1"' }).end();
        return res.writeHead(200, { "Content-Type": "application/json", ETag: '"v1"' }).end("{}");
    }
    res.writeHead(404, { "Content-Type": "text/plain" }).end("nope");
});

let site, base, bare, bareBase, dead, deadBase;
const listen = (s) => new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
before(async () => {
    await listen(upstream);
    site = createServer({ poller, publicDir, mapUpstream: `http://127.0.0.1:${upstream.address().port}` });
    await listen(site);
    base = `http://127.0.0.1:${site.address().port}`;
    bare = createServer({ poller, publicDir });
    await listen(bare);
    bareBase = `http://127.0.0.1:${bare.address().port}`;
    // an upstream port with nothing listening
    const probe = http.createServer();
    await listen(probe);
    const deadPort = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    dead = createServer({ poller, publicDir, mapUpstream: `http://127.0.0.1:${deadPort}`, mapTimeoutMs: 500 });
    await listen(dead);
    deadBase = `http://127.0.0.1:${dead.address().port}`;
});
after(() => { site.close(); bare.close(); dead.close(); upstream.close(); });

// fetch() normalises "/../x" away; send raw paths over a plain request instead.
function raw(port, path, method = "GET") {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port, path, method }, (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode));
        });
        req.on("error", reject);
        req.end();
    });
}

test("/map redirects to /map/ so the map's relative URLs resolve under it", async () => {
    const res = await fetch(`${base}/map`, { redirect: "manual" });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get("location"), "/map/");
});

test("/map/ serves squaremap's page, framable by this site only", async () => {
    const res = await fetch(`${base}/map/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/html");
    assert.equal(await res.text(), "<title>squaremap</title>");
    const csp = res.headers.get("content-security-policy");
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /img-src 'self' data: blob:/);
    assert.match(csp, /script-src 'self'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("set-cookie"), null, "upstream cookies are not passed on");
});

test("map assets and tiles pass through with their path and query string", async () => {
    seen.length = 0;
    const js = await fetch(`${base}/map/assets/index-abc.js`);
    assert.equal(js.status, 200);
    assert.equal(js.headers.get("content-type"), "application/javascript");
    assert.equal(await js.text(), "console.log(1)");
    const tiles = await fetch(`${base}/map/tiles/players.json?t=1700000000`);
    assert.equal(tiles.status, 200);
    assert.equal(tiles.headers.get("etag"), '"v1"');
    assert.deepEqual(seen.map((r) => r.url), ["/assets/index-abc.js", "/tiles/players.json?t=1700000000"]);
});

test("conditional requests reach squaremap and its 304 comes back", async () => {
    const res = await fetch(`${base}/map/tiles/players.json`, { headers: { "If-None-Match": '"v1"' } });
    assert.equal(res.status, 304);
});

test("squaremap's 404 stays a 404", async () => {
    assert.equal((await fetch(`${base}/map/tiles/minecraft_overworld/3/9_9.png`)).status, 404);
});

test("only the visitor's path and conditional headers are forwarded", async () => {
    seen.length = 0;
    await (await fetch(`${base}/map/`, { headers: { Cookie: "secret=1", Authorization: "Bearer x" } })).arrayBuffer();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].headers.cookie, undefined);
    assert.equal(seen[0].headers.authorization, undefined);
});

test("traversal and odd paths under /map/ are refused without asking squaremap", async () => {
    seen.length = 0;
    const port = site.address().port;
    for (const path of ["/map/../servers.json", "/map/%2e%2e/x", "/map/a/../../x", "/map//etc/passwd", "/map/a%00b", "/map/a\\b", "/map/x?y=<z>", "/mapx"]) {
        assert.equal(await raw(port, path), 404, path);
    }
    assert.equal(seen.length, 0);
});

test("only GET and HEAD reach the map", async () => {
    assert.equal(await raw(site.address().port, "/map/", "POST"), 405);
    assert.equal(await raw(site.address().port, "/map/", "HEAD"), 200);
});

test("an unreachable squaremap is a 502, not a hang or a crash", async () => {
    const res = await fetch(`${deadBase}/map/`);
    assert.equal(res.status, 502);
    assert.equal((await fetch(`${deadBase}/healthz`)).status, 200);
});

test("without a map upstream /map/ does not exist", async () => {
    assert.equal((await fetch(`${bareBase}/map/`)).status, 404);
});

test("the page offers LAN, Map and Stats tabs, each with a panel, and loads no map until asked", async () => {
    const html = await readFile(new URL("index.html", publicDir), "utf8");
    const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1].trim());
    assert.deepEqual(tabs, ["LAN", "Map", "Stats"]);
    for (const id of ["panel-lan", "panel-map", "panel-stats"]) {
        assert.match(html, new RegExp(`aria-controls="${id}"`), id);
        assert.match(html, new RegExp(`<div id="${id}" role="tabpanel"`), id);
    }
    assert.ok(!/<iframe\b/.test(html), "the map iframe is created on first open, not on page load");
});
