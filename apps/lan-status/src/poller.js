// Polls all servers on a fixed timer and keeps the latest snapshot in memory.
// Visitors only ever read snapshot(); game servers are queried by the timer alone.
import { toStatus, initialStatus, summarize } from "./status.js";

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createPoller({ servers, query, intervalMs = 15000, timeoutMs = 3000, now = () => new Date() }) {
    let statuses = servers.map(initialStatus);
    let updatedAt = null;
    let queries = 0;
    let running = false;
    let timer = null;

    async function pollOnce() {
        if (running) return; // a slow poll is still in flight; skip instead of piling up
        running = true;
        try {
            const results = await Promise.allSettled(servers.map((server) => {
                queries++;
                return withTimeout(Promise.resolve().then(() => query(server, timeoutMs)), timeoutMs);
            }));
            const checkedAt = now().toISOString();
            statuses = servers.map((server, i) => toStatus(server, results[i].status === "fulfilled" ? results[i].value : null, checkedAt));
            updatedAt = checkedAt;
        } finally {
            running = false;
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
            return { updatedAt, summary: summarize(statuses), servers: statuses };
        },
        queryCount() {
            return queries;
        },
    };
}
