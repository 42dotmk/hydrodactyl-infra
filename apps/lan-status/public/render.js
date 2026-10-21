// Display text for one server card. Pure functions so they can be unit-tested outside the browser.

export function statusText(s) {
    if (s.checkedAt === null) return "checking…";
    return s.online ? "online" : "offline";
}

export function playersText(s) {
    if (!s.online) return "—";
    const max = s.maxPlayers != null ? `/${s.maxPlayers}` : "";
    return s.bots > 0 ? `${s.players}${max} + ${s.bots} bots` : `${s.players}${max}`;
}
