// One-shot poll of servers.json, printed as JSON (npm run probe). Used to check reachability
// and gamedig types from wherever the service will run.
import { readFile } from "node:fs/promises";
import { createPoller } from "./poller.js";
import { gamedigQuery } from "./query.js";

const file = process.env.SERVERS_FILE ?? new URL("../servers.json", import.meta.url);
const servers = JSON.parse(await readFile(file, "utf8"));
const poller = createPoller({ servers, query: gamedigQuery });
await poller.pollOnce();
console.log(JSON.stringify(poller.snapshot(), null, 2));
