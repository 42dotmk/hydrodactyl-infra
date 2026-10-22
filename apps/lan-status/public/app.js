// Renders /api/status into the server list. Every value goes in through textContent: server-reported
// strings (map names, hostnames) are never interpreted as HTML.
import { REFRESH_MS, statusText, playersText, freshness, summaryText, updatedText } from "/render.js";

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

// Tabs: LAN (the server list) and Map (squaremap, framed from /map/). The map is only requested the
// first time its tab opens, so visitors who never look at it cost the Minecraft server nothing.
const tabs = [...document.querySelectorAll('[role="tab"]')];

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
    history.replaceState(null, "", tab.id === "tab-map" ? "#map" : location.pathname);
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
const tabForHash = () => document.getElementById(location.hash === "#map" ? "tab-map" : "tab-lan");
window.addEventListener("hashchange", () => selectTab(tabForHash()));
if (location.hash === "#map") selectTab(tabForHash());

document.getElementById("refresh").addEventListener("click", refresh);
loop();
setInterval(render, 1000);
