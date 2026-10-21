// Turns gamedig query results into the public status shape. Only counts leave this module:
// gamedig's players[]/bots[] carry names, which must never reach the public page.

export function toStatus(server, result, checkedAt) {
    const base = {
        id: server.id,
        name: server.name,
        game: server.type,
        address: `${server.host}:${server.port}`,
    };
    if (!result) {
        return { ...base, online: false, map: null, players: null, bots: null, maxPlayers: null, checkedAt };
    }
    const bots = Array.isArray(result.bots) ? result.bots.length : 0;
    const total = Number.isInteger(result.numplayers) ? result.numplayers : (result.players ?? []).length;
    return {
        ...base,
        online: true,
        map: result.map || null,
        players: Math.max(0, total - bots),
        bots,
        maxPlayers: Number.isInteger(result.maxplayers) ? result.maxplayers : null,
        checkedAt,
    };
}

export function initialStatus(server) {
    return toStatus(server, null, null);
}

export function summarize(statuses) {
    const online = statuses.filter((s) => s.online);
    return {
        online: online.length,
        total: statuses.length,
        players: online.reduce((sum, s) => sum + (s.players ?? 0), 0),
    };
}
