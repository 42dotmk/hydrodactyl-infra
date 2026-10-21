import { GameDig } from "gamedig";

// gamedig reports success only after slow sub-queries time out (Minecraft's UDP/Bedrock probes,
// open.mp's unanswered player-list request), so the socket timeout must sit well inside the attempt
// timeout, and the attempt inside the poller's own timeout. One attempt: the next poll is the retry.
export function queryOptions(server, timeoutMs) {
    const attemptTimeout = timeoutMs - 200;
    return {
        type: server.type,
        host: server.host,
        port: server.port,
        socketTimeout: Math.floor(attemptTimeout / 2) - 100,
        attemptTimeout,
        maxRetries: 0,
    };
}

export function gamedigQuery(server, timeoutMs) {
    return GameDig.query(queryOptions(server, timeoutMs));
}
