// Renders /api/status. Every value goes in through textContent: server-reported strings
// (map names, hostnames) are never interpreted as HTML.
import { statusText, playersText } from "/render.js";

const REFRESH_MS = 15000;
const FIRST_POLL_RETRY_MS = 3000; // right after a deploy, the first poll lands within ~3 s
let updatedAt = null;
let fetchFailed = false;

function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
}

function card(s) {
    const root = el("article", { class: `card ${s.online ? "online" : s.checkedAt === null ? "checking" : "offline"}` });
    const title = el("h2");
    title.append(el("span", { class: "dot", "aria-hidden": "true" }), el("span", {}, s.name));
    const details = el("dl");
    const rows = [
        ["Status", statusText(s)],
        ["Map", s.online && s.map ? s.map : "—"],
        ["Players", playersText(s)],
        ["Join", s.address],
    ];
    for (const [label, value] of rows) {
        details.append(el("dt", {}, label), el("dd", label === "Join" ? { class: "address" } : {}, value));
    }
    root.append(title, details);
    return root;
}

function ago(iso) {
    const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)} min ago`;
}

function renderUpdated() {
    const text = fetchFailed ? "status service unreachable – retrying" : updatedAt ? `updated ${ago(updatedAt)}` : "";
    document.getElementById("updated").textContent = text;
}

function render(snapshot) {
    updatedAt = snapshot.updatedAt;
    const { online, total, players } = snapshot.summary;
    document.getElementById("summary").textContent = updatedAt
        ? `${online} of ${total} servers online · ${players} ${players === 1 ? "player" : "players"}`
        : "checking servers…";
    document.getElementById("servers").replaceChildren(...snapshot.servers.map(card));
    renderUpdated();
}

async function refresh() {
    try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        fetchFailed = false;
        render(await res.json());
    } catch {
        fetchFailed = true;
        renderUpdated();
    }
}

async function loop() {
    await refresh();
    setTimeout(loop, updatedAt ? REFRESH_MS : FIRST_POLL_RETRY_MS);
}

loop();
setInterval(renderUpdated, 1000);
