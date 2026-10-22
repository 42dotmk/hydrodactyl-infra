// Renders /api/status into the server list. Every value goes in through textContent: server-reported
// strings (map names, hostnames) are never interpreted as HTML.
import { REFRESH_MS, statusText, playersText, freshness, summaryText, updatedText, kdText, hsText, savedText } from "/render.js";

const FIRST_POLL_RETRY_MS = 3000; // right after a deploy, the first poll lands within ~3 s
let snapshot = { updatedAt: null, summary: { online: 0, total: 0, players: 0 }, servers: [] };
let fetchFailed = false;
let shownState = null;
let shownAt = null;
let inFlight = false;

function cell(className, text) {
    const td = document.createElement("td");
    td.setAttribute("role", "cell");
    td.className = className;
    if (text !== undefined) td.textContent = text;
    return td;
}

function row(s, trusted) {
    // When the snapshot itself is stale or unreachable, no row may claim to be online.
    const state = !trusted ? "unknown" : s.online ? "online" : s.checkedAt === null ? "checking" : "offline";
    const tr = document.createElement("tr");
    tr.setAttribute("role", "row");
    tr.className = state;

    const lamp = cell("lamp");
    const light = document.createElement("i");
    light.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "sr";
    label.textContent = trusted ? statusText(s) : "unknown";
    lamp.append(light, label);

    const players = cell("num");
    if (!trusted) {
        players.textContent = "?";
    } else if (s.online && s.bots > 0) {
        const max = s.maxPlayers != null ? `/${s.maxPlayers}` : "";
        const bots = document.createElement("span");
        bots.className = "bots";
        bots.textContent = ` +${s.bots} ${s.bots === 1 ? "bot" : "bots"}`;
        players.append(`${s.players}${max}`, bots);
    } else {
        players.textContent = s.online ? playersText(s) : statusText(s);
    }

    const map = trusted && s.online && s.map ? s.map : "";
    tr.append(lamp, cell("server", s.name), cell("map", map), players, cell("join", s.address));
    return tr;
}

// Re-render rows only when what they may claim changes, so selecting an address is not reset every second.
function render() {
    const now = Date.now();
    const state = freshness({ updatedAt: snapshot.updatedAt, fetchFailed }, now);
    document.getElementById("summary").textContent = summaryText(snapshot, state);
    document.getElementById("updated").textContent = updatedText(snapshot.updatedAt, state, now);
    document.querySelector(".window").dataset.state = state;
    if (state !== shownState || snapshot.updatedAt !== shownAt) {
        const trusted = state === "fresh" || state === "pending";
        document.getElementById("servers").replaceChildren(...snapshot.servers.map((s) => row(s, trusted)));
        shownState = state;
        shownAt = snapshot.updatedAt;
    }
}

async function refresh() {
    if (inFlight) return;
    inFlight = true;
    const button = document.getElementById("refresh");
    button.disabled = true;
    try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        snapshot = await res.json();
        fetchFailed = false;
    } catch {
        fetchFailed = true;
    } finally {
        inFlight = false;
        button.disabled = false;
        render();
    }
}

async function loop() {
    await refresh();
    setTimeout(loop, snapshot.updatedAt ? REFRESH_MS : FIRST_POLL_RETRY_MS);
}

// --- Stats tab: all-time CSX leaderboards from /api/stats, one group of rows per CS server ---
const STATS_REFRESH_MS = 30000;
let statsTimer = null;

function statsRows(board) {
    const group = document.createElement("tr");
    group.setAttribute("role", "row");
    group.className = "group";
    const th = document.createElement("th");
    th.setAttribute("role", "rowheader");
    th.colSpan = 7;
    const saved = document.createElement("span");
    saved.className = "saved";
    saved.textContent = savedText(board.savedAt);
    th.append(board.name, " ", saved);
    group.append(th);
    if (board.players.length === 0) {
        const empty = document.createElement("tr");
        empty.setAttribute("role", "row");
        empty.className = "empty";
        const td = cell("hint", "No ranked players yet: stats are saved when a map ends.");
        td.colSpan = 7;
        empty.append(td);
        return [group, empty];
    }
    return [group, ...board.players.map((p, i) => {
        const tr = document.createElement("tr");
        tr.setAttribute("role", "row");
        const detail = `K ${p.kills} · D ${p.deaths} · K/D ${kdText(p.kills, p.deaths)} · HS ${hsText(p.headshots, p.kills)}`;
        tr.append(cell("num rank", String(i + 1)), cell("player", p.name), cell("num score", String(p.score)),
            cell("num kills", String(p.kills)), cell("num deaths", String(p.deaths)),
            cell("num kd", kdText(p.kills, p.deaths)), cell("num hs", hsText(p.headshots, p.kills)),
            cell("detail", detail));
        return tr;
    })];
}

async function refreshStats() {
    const button = document.getElementById("stats-refresh");
    const hint = document.getElementById("stats-hint");
    button.disabled = true;
    try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const snap = await res.json();
        document.getElementById("stats").replaceChildren(...snap.servers.flatMap(statsRows));
        hint.textContent = snap.failed
            ? "Stats service unreachable; showing the last boards received."
            : "All-time, ranked like /top15 in game: kills − deaths − team kills.";
    } catch {
        hint.textContent = "Stats unavailable right now, retrying.";
    } finally {
        button.disabled = false;
    }
}

// --- Tabs: LAN (the server list), Map (squaremap, framed from /map/) and Stats. The map and the stats
// are only requested once their tab is open, so visitors who never look cost the servers nothing.
const tabs = [...document.querySelectorAll('[role="tab"]')];
const HASHES = { "#map": "tab-map", "#stats": "tab-stats" };

function openMap() {
    const frame = document.getElementById("mapframe");
    if (frame.firstElementChild) return;
    const iframe = document.createElement("iframe");
    iframe.src = "/map/";
    iframe.title = "Minecraft world map";
    frame.append(iframe);
}

function selectTab(tab, { focus = false } = {}) {
    for (const t of tabs) {
        const selected = t === tab;
        t.setAttribute("aria-selected", String(selected));
        t.tabIndex = selected ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
    }
    if (tab.id === "tab-map") openMap();
    clearInterval(statsTimer);
    if (tab.id === "tab-stats") {
        refreshStats();
        statsTimer = setInterval(refreshStats, STATS_REFRESH_MS);
    }
    const hash = Object.keys(HASHES).find((h) => HASHES[h] === tab.id);
    history.replaceState(null, "", hash ?? location.pathname);
    if (focus) tab.focus();
}

for (const tab of tabs) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
        const i = tabs.indexOf(tab);
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        selectTab(tabs[(next + tabs.length) % tabs.length], { focus: true });
    });
}
const tabForHash = () => document.getElementById(HASHES[location.hash] ?? "tab-lan");
window.addEventListener("hashchange", () => selectTab(tabForHash()));
if (HASHES[location.hash]) selectTab(tabForHash());

document.getElementById("stats-refresh").addEventListener("click", refreshStats);
document.getElementById("refresh").addEventListener("click", refresh);
loop();
setInterval(render, 1000);
