// Polls the CS leaderboard exporter on wings-01 (games/cs16/stats, GET /stats.json) on a timer and
// keeps a cleaned copy in memory. Visitors only ever read snapshot(); the exporter is asked by the timer.
const MAX_PLAYERS = 15;
const MAX_NAME = 32; // CS 1.6 names are at most 31 characters
const NUMBERS = ["score", "kills", "deaths", "headshots", "shots", "hits"];

function cleanPlayer(p) {
    if (!p || typeof p.name !== "string" || !NUMBERS.every((k) => Number.isSafeInteger(p[k]))) return null;
    return { name: p.name.slice(0, MAX_NAME), ...Object.fromEntries(NUMBERS.map((k) => [k, p[k]])) };
}

function cleanBoard(server, upstream) {
    const players = (Array.isArray(upstream?.players) ? upstream.players : []).map(cleanPlayer).filter(Boolean).slice(0, MAX_PLAYERS);
    const savedAt = typeof upstream?.savedAt === "string" && !Number.isNaN(Date.parse(upstream.savedAt)) ? upstream.savedAt : null;
    const totalPlayers = Number.isSafeInteger(upstream?.totalPlayers) ? upstream.totalPlayers : players.length;
    return { id: server.id, name: server.name, savedAt, totalPlayers, players };
}

export function createStatsPoller({ url, servers, fetchImpl = fetch, intervalMs = 30000, timeoutMs = 5000, now = () => new Date() }) {
    let boards = [];
    let updatedAt = null;
    let failed = false;
    let timer = null;

    async function pollOnce() {
        try {
            const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            const byId = new Map((Array.isArray(body?.servers) ? body.servers : []).map((s) => [s?.id, s]));
            // this site's servers, in servers.json order; ids the site does not list are ignored
            boards = servers.filter((s) => byId.has(s.id)).map((s) => cleanBoard(s, byId.get(s.id)));
            updatedAt = now().toISOString();
            failed = false;
        } catch {
            failed = true; // keep the last good boards; the page says they may be old
        }
    }

    return {
        pollOnce,
        start() {
            if (timer) return;
            pollOnce();
            timer = setInterval(pollOnce, intervalMs);
            timer.unref();
        },
        stop() {
            clearInterval(timer);
            timer = null;
        },
        snapshot() {
            return { updatedAt, failed, servers: boards };
        },
    };
}
