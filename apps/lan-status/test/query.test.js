import { test } from "node:test";
import assert from "node:assert/strict";
import { queryOptions } from "../src/query.js";

const server = { id: "minecraft", name: "Minecraft", type: "minecraft", host: "192.168.101.39", port: 25565 };

// gamedig only reports success after slow sub-queries time out (Minecraft's UDP query/Bedrock probes,
// open.mp's unanswered player-list request). If the socket timeout equals the attempt timeout the
// attempt is cut off at that very moment and a healthy server shows as offline.
test("socket timeout leaves room inside the attempt, attempt inside the poll timeout", () => {
    const o = queryOptions(server, 3000);
    assert.ok(o.socketTimeout * 2 <= o.attemptTimeout, `socket ${o.socketTimeout} vs attempt ${o.attemptTimeout}`);
    assert.ok(o.attemptTimeout < 3000, `attempt ${o.attemptTimeout} must finish before the poll timeout`);
});

test("query options target the configured server", () => {
    const o = queryOptions(server, 3000);
    assert.equal(o.type, "minecraft");
    assert.equal(o.host, "192.168.101.39");
    assert.equal(o.port, 25565);
    assert.equal(o.maxRetries, 0);
});
