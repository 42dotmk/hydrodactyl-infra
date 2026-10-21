import { readFile } from "node:fs/promises";
import { createPoller } from "./poller.js";
import { gamedigQuery } from "./query.js";
import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const serversFile = process.env.SERVERS_FILE ?? new URL("../servers.json", import.meta.url);
const servers = JSON.parse(await readFile(serversFile, "utf8"));

const poller = createPoller({ servers, query: gamedigQuery });
const server = createServer({ poller, publicDir: new URL("../public/", import.meta.url) });

poller.start();
server.listen(port, () => console.log(`lan-status: ${servers.length} servers, listening on :${port}`));

for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
        poller.stop();
        server.close(() => process.exit(0));
    });
}
