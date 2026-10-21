// Display text for the server list. Pure functions so they can be unit-tested outside the browser.

export const REFRESH_MS = 15000;
const STALE_AFTER_MS = 3 * REFRESH_MS; // three missed polls: the numbers can no longer be trusted

export function statusText(s) {
    if (s.checkedAt === null) return "checking…";
    return s.online ? "online" : "offline";
}

export function playersText(s) {
    if (!s.online) return "—";
    const max = s.maxPlayers != null ? `/${s.maxPlayers}` : "";
    if (!(s.bots > 0)) return `${s.players}${max}`;
    return `${s.players}${max} + ${s.bots} ${s.bots === 1 ? "bot" : "bots"}`;
}

/** "pending" | "fresh" | "stale" | "unreachable" — whether the snapshot on screen can be believed. */
export function freshness({ updatedAt, fetchFailed }, nowMs) {
    if (fetchFailed) return "unreachable";
    if (updatedAt === null) return "pending";
    return nowMs - Date.parse(updatedAt) > STALE_AFTER_MS ? "stale" : "fresh";
}

export function summaryText(snapshot, state) {
    if (state === "pending") return "checking servers…";
    if (state !== "fresh") return "status unknown";
    const { online, total, players } = snapshot.summary;
    return `${online} of ${total} servers online · ${players} ${players === 1 ? "player" : "players"}`;
}

function ago(iso, nowMs) {
    const seconds = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
    return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)} min ago`;
}

export function updatedText(updatedAt, state, nowMs) {
    if (state === "fresh") return `updated ${ago(updatedAt, nowMs)}`;
    const reason = state === "unreachable" ? "status service unreachable, retrying" : state === "stale" ? "data is stale" : "";
    if (!updatedAt) return reason;
    return `last update ${ago(updatedAt, nowMs)} · ${reason}`;
}
