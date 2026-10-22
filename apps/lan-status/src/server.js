// HTTP front of the status board. Fixed route table: no file path is ever built from the request URL,
// and /api/status and /api/stats only read in-memory snapshots (visitors never trigger queries).
// /map/ is the one pass-through: squaremap's web server on the Minecraft server, for the Map tab.
import http from "node:http";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";

const SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

// squaremap's page may be framed by this site only; its tiles arrive as fetch()ed blobs.
const MAP_SECURITY_HEADERS = {
    ...SECURITY_HEADERS,
    "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'",
};
// Visitor paths are only ever plain segments (no "%", no "\\", no empty, "." or ".." segment);
// query strings are squaremap's own cache-busters and view state.
const MAP_PATH = /^\/map\/((?:[A-Za-z0-9_~-][A-Za-z0-9._~-]*\/)*(?:[A-Za-z0-9_~-][A-Za-z0-9._~-]*)?)$/;
const MAP_QUERY = /^[A-Za-z0-9._~=&:,+%-]*$/;
const MAP_PASS_HEADERS = ["content-type", "cache-control", "etag", "last-modified"];
const MAP_CONDITIONAL_HEADERS = ["if-none-match", "if-modified-since"];

const STATIC = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/style.css": ["style.css", "text/css; charset=utf-8"],
    "/render.js": ["render.js", "text/javascript; charset=utf-8"],
};

// 88x31 buttons from the GeoCities archive (hellnet.work/8831), self-hosted for the CSP.
const IMAGE_TYPES = { gif: "image/gif", jpg: "image/jpeg", png: "image/png" };
const BADGES = ["counter-strike.gif", "cs-configs.gif", "lanparty.gif", "get-frags-now.gif",
    "greatest-fps-page.gif", "telefragged.gif", "linux-now.jpg", "any-html-browser.png"];
for (const file of BADGES) STATIC[`/badges/${file}`] = [`badges/${file}`, IMAGE_TYPES[file.split(".").pop()]];

// DejaVu Sans (Bitstream Vera licence, see public/fonts/LICENSE), Latin subset: the VGUI voice on
// devices without Tahoma/Verdana (Android).
for (const file of ["dejavu-sans.woff2", "dejavu-sans-bold.woff2"]) STATIC[`/fonts/${file}`] = [`fonts/${file}`, "font/woff2"];

export function createServer({ poller, publicDir, stats = null, mapUpstream = null, mapTimeoutMs = 10_000 }) {
    const assets = Object.fromEntries(Object.entries(STATIC).map(([route, [file, type]]) =>
        [route, { body: readFileSync(new URL(file, publicDir)), type }]));

    return http.createServer((req, res) => {
        const path = new URL(req.url, "http://localhost").pathname;
        const send = (status, type, body, extra = {}) => {
            res.writeHead(status, { "Content-Type": type, ...SECURITY_HEADERS, ...extra });
            res.end(req.method === "HEAD" ? undefined : body);
        };
        if (req.method !== "GET" && req.method !== "HEAD") return send(405, "text/plain; charset=utf-8", "method not allowed", { Allow: "GET, HEAD" });
        if (mapUpstream && (path === "/map" || path.startsWith("/map/"))) return serveMap(req, res, send);
        if (path === "/api/status") {
            return send(200, "application/json; charset=utf-8", JSON.stringify(poller.snapshot()), { "Cache-Control": "no-store" });
        }
        if (path === "/api/stats" && stats) {
            return send(200, "application/json; charset=utf-8", JSON.stringify(stats.snapshot()), { "Cache-Control": "no-store" });
        }
        if (path === "/healthz") return send(200, "text/plain; charset=utf-8", "ok", { "Cache-Control": "no-store" });
        const asset = assets[path];
        if (asset) return send(200, asset.type, asset.body, { "Cache-Control": "no-cache" });
        return send(404, "text/plain; charset=utf-8", "not found");
    });

    async function serveMap(req, res, send) {
        const [rawPath, query = ""] = req.url.split(/\?(.*)/s);
        if (rawPath === "/map") return send(301, "text/plain; charset=utf-8", "moved", { Location: "/map/" });
        const match = MAP_PATH.exec(rawPath);
        if (!match || !MAP_QUERY.test(query)) return send(404, "text/plain; charset=utf-8", "not found");

        const headers = {};
        for (const name of MAP_CONDITIONAL_HEADERS) if (req.headers[name]) headers[name] = req.headers[name];
        let upstream;
        try {
            upstream = await fetch(`${mapUpstream}/${match[1]}${query ? `?${query}` : ""}`, {
                method: req.method, headers, redirect: "manual", signal: AbortSignal.timeout(mapTimeoutMs),
            });
        } catch {
            return send(502, "text/plain; charset=utf-8", "map unavailable", { "Cache-Control": "no-store" });
        }
        const passed = {};
        for (const name of MAP_PASS_HEADERS) {
            const value = upstream.headers.get(name);
            if (value !== null) passed[name] = value;
        }
        res.writeHead(upstream.status, { ...MAP_SECURITY_HEADERS, ...passed });
        if (req.method === "HEAD" || !upstream.body) return res.end();
        Readable.fromWeb(upstream.body).on("error", () => res.destroy()).pipe(res);
    }
}
