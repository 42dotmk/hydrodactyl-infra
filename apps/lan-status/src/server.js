// HTTP front of the status board. Fixed route table: no path is ever built from the request URL,
// and /api/status only reads the poller's in-memory snapshot (visitors never trigger queries).
import http from "node:http";
import { readFileSync } from "node:fs";

const SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

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

export function createServer({ poller, publicDir }) {
    const assets = Object.fromEntries(Object.entries(STATIC).map(([route, [file, type]]) =>
        [route, { body: readFileSync(new URL(file, publicDir)), type }]));

    return http.createServer((req, res) => {
        const path = new URL(req.url, "http://localhost").pathname;
        const send = (status, type, body, extra = {}) => {
            res.writeHead(status, { "Content-Type": type, ...SECURITY_HEADERS, ...extra });
            res.end(req.method === "HEAD" ? undefined : body);
        };
        if (req.method !== "GET" && req.method !== "HEAD") return send(405, "text/plain; charset=utf-8", "method not allowed", { Allow: "GET, HEAD" });
        if (path === "/api/status") {
            return send(200, "application/json; charset=utf-8", JSON.stringify(poller.snapshot()), { "Cache-Control": "no-store" });
        }
        if (path === "/healthz") return send(200, "text/plain; charset=utf-8", "ok", { "Cache-Control": "no-store" });
        const asset = assets[path];
        if (asset) return send(200, asset.type, asset.body, { "Cache-Control": "no-cache" });
        return send(404, "text/plain; charset=utf-8", "not found");
    });
}
