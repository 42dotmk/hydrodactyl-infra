import { readFile } from "node:fs/promises";
import { createPoller } from "./poller.js";
import { gamedigQuery } from "./query.js";
import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const serversFile = process.env.SERVERS_FILE ?? new URL("../servers.json", import.meta.url);
const servers = JSON.parse(await readFile(serversFile, "utf8"));
// squaremap's internal web server on the Minecraft server (games/minecraft); unset hides /map/.
const mapUpstream = process.env.MAP_UPSTREAM || null;

const poller = createPoller({ servers, query: gamedigQuery });
const server = createServer({ poller, publicDir: new URL("../public/", import.meta.url), mapUpstream });

poller.start();
server.listen(port, () => console.log(`lan-status: ${servers.length} servers, map ${mapUpstream ?? "off"}, listening on :${port}`));

for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
        poller.stop();
        server.close(() => process.exit(0));
    });
}
