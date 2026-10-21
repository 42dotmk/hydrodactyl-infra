# LAN Status Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public status board at https://lan.apps.42.mk showing which LAN game servers are up, players and maps, deployed to the base42 Dokploy through Pulumi.

**Architecture:** A small Node service polls all game servers with gamedig on a fixed timer, keeps the latest snapshot in memory and serves it as JSON plus a static page that re-fetches it. Dokploy builds the service from this public repo's Dockerfile; a Pulumi component in the `dokploy` project creates the Application and the domain, and passes a content hash of the app directory so code changes redeploy.

**Tech Stack:** Node 24 (ESM, built-in `node:test`, `node:http`), gamedig 5.3.3, vanilla HTML/CSS/JS, Docker (`node:24-alpine`), Pulumi TypeScript + `@dimeskigj/pulumi-dokploy` 0.4.0.

**Spec:** `docs/superpowers/specs/2026-10-21-lan-status-site-design.md`

## Working conventions

- Repo root is `/root/hydrodactyl-infra` on base42 (root shell, mise on PATH). All paths below are relative to it.
- Run Node commands through mise so the pinned Node 24 is used: `mise exec -- <cmd>` from the repo root, or `mise exec -C apps/lan-status -- npm test`.
- Commit with the repo-local identity already configured (`base42-infra`). Do not push; the user pushes (Task 5 asks them).

## Global Constraints

- Public URL: `lan.apps.42.mk`; Dokploy domain `https: false`, `certificateType: "none"` (Caddy on base42 does TLS).
- Repo for Dokploy: `https://github.com/42dotmk/hydrodactyl-infra.git`, branch `main`, build path `apps/lan-status`, `Dockerfile`.
- Dokploy endpoint/config: existing `dokploy` Pulumi project, stack `prod` (`dokploy:endpoint http://10.10.0.249:3000`).
- Game servers host: `192.168.101.39`; poll every 15 s, per-query timeout 3 s; page refresh every 15 s.
- No player names/SteamIDs in any output. No third-party requests from the page (no CDN/fonts/analytics).
- Visitors never trigger game-server queries; only the timer does.
- gamedig pinned to exact version `5.3.3`; Node `>=24`.
- Container listens on port `3000`, runs as the non-root `node` user, has a healthcheck on `/healthz`.

## Review Focus

- A server that is down or times out → shown offline with no map/players, everything else unaffected. (Task 2: `query rejection marks only that server offline`)
- One server that never answers → snapshot still completes within the timeout, others are fresh. (Task 2: `hanging query does not block the poll`)
- Many page loads → zero extra game-server queries. (Task 3: `GET /api/status does not query servers`)
- Map names or hostnames containing `<script>`/HTML → displayed as text, never interpreted. (Task 3: page renders all strings via `textContent`; test `index.html contains no inline data` + manual check in Task 5)
- Requests for anything but the known routes (incl. `/../package.json`, `/servers.json`) → 404, no file disclosure. (Task 3: `unknown and traversal paths return 404`)

---

### Task 1: Status model and app scaffold

**Files:**
- Create: `apps/lan-status/package.json`, `apps/lan-status/package-lock.json` (via npm), `apps/lan-status/.gitignore` (`node_modules/`), `apps/lan-status/servers.json`
- Create: `apps/lan-status/src/status.js`
- Test: `apps/lan-status/test/status.test.js`

**Interfaces:**
- Produces:
  - `servers.json`: array of `{ "id": string, "name": string, "type": string /* gamedig type */, "host": string, "port": number }` with the six servers from the spec table (ids `cs-classic`, `cs-gungame`, `cs-deathrun`, `hl2dm`, `samp`, `minecraft`; types `counterstrike16`, `counterstrike16`, `counterstrike16`, `hl2d`, `gtasam`, `minecraft`).
  - `toStatus(server, result, checkedAt) -> ServerStatus` where `result` is a gamedig state object or `null` (failed/timeout) and `checkedAt` an ISO string. `ServerStatus = { id, name, game: server.type, address: "host:port", online: boolean, map: string|null, players: number|null /* humans */, bots: number|null, maxPlayers: number|null, checkedAt: string|null }`.
  - `summarize(statuses) -> { online: number, total: number, players: number /* humans, online servers only */ }`.
  - `initialStatus(server) -> ServerStatus` (offline, all nullable fields `null`, `checkedAt: null`).

- [ ] **Step 1: Create `package.json`**: `"name": "lan-status"`, `"private": true`, `"type": "module"`, `"engines": { "node": ">=24" }`, `"scripts": { "start": "node src/main.js", "test": "node --test", "probe": "node src/probe.js" }`, dependency `"gamedig": "5.3.3"`. Run `mise exec -C apps/lan-status -- npm install` → creates the lockfile.

- [ ] **Step 2: Write the failing tests** in `test/status.test.js`:

```js
const cs = { id: "cs-classic", name: "CS 1.6 Classic", type: "counterstrike16", host: "192.168.101.39", port: 27015 };
test("online server maps gamedig state, bots counted separately", () => {
  const s = toStatus(cs, { map: "fy_pool_day", numplayers: 12, maxplayers: 20, bots: [{}, {}, {}], players: [] }, "2026-10-21T12:00:00.000Z");
  assert.deepEqual(s, { id: "cs-classic", name: "CS 1.6 Classic", game: "counterstrike16", address: "192.168.101.39:27015",
    online: true, map: "fy_pool_day", players: 9, bots: 3, maxPlayers: 20, checkedAt: "2026-10-21T12:00:00.000Z" });
});
test("null result is offline with null details", () => {
  const s = toStatus(cs, null, "2026-10-21T12:00:00.000Z");
  assert.equal(s.online, false); assert.equal(s.map, null); assert.equal(s.players, null); assert.equal(s.checkedAt, "2026-10-21T12:00:00.000Z");
});
test("missing numplayers falls back to players array length", () => {
  assert.equal(toStatus(cs, { map: "x", players: [{}, {}], bots: [], maxplayers: 10 }, "t").players, 2);
});
test("status never contains player names", () => {
  const s = toStatus(cs, { map: "x", numplayers: 1, maxplayers: 10, players: [{ name: "alice" }], bots: [] }, "t");
  assert.ok(!JSON.stringify(s).includes("alice"));
});
test("summarize counts online servers and humans only", () => {
  const a = toStatus(cs, { map: "m", numplayers: 5, maxplayers: 20, bots: [{}, {}], players: [] }, "t");
  const b = toStatus({ ...cs, id: "x" }, null, "t");
  assert.deepEqual(summarize([a, b]), { online: 1, total: 2, players: 3 });
});
test("initialStatus is offline and unchecked", () => {
  assert.deepEqual(initialStatus(cs), { ...toStatus(cs, null, null), checkedAt: null });
});
test("servers.json lists the six servers with valid fields", async () => {
  const servers = JSON.parse(await readFile(new URL("../servers.json", import.meta.url)));
  assert.equal(servers.length, 6);
  for (const s of servers) { assert.match(s.id, /^[a-z0-9-]+$/); assert.ok(Number.isInteger(s.port)); assert.ok(s.type && s.host && s.name); }
});
```

- [ ] **Step 3: Run** `mise exec -C apps/lan-status -- npm test` → FAIL (`toStatus` not exported).

- [ ] **Step 4: Implement** `toStatus`, `summarize`, `initialStatus` in `src/status.js` and write `servers.json`. Humans = `max(0, numplayers - bots)`; never copy `players[]`/`bots[]` entries into the output.

- [ ] **Step 5: Run** `mise exec -C apps/lan-status -- npm test` → all PASS.

- [ ] **Step 6: Commit** `git add apps/lan-status && git commit -m "lan-status: status model and server list"`.

---

### Task 2: Poller, real gamedig query and network check

**Files:**
- Create: `apps/lan-status/src/poller.js`, `apps/lan-status/src/query.js`, `apps/lan-status/src/probe.js`
- Test: `apps/lan-status/test/poller.test.js`

**Interfaces:**
- Consumes: `toStatus`, `initialStatus`, `summarize` (Task 1).
- Produces:
  - `createPoller({ servers, query, intervalMs = 15000, timeoutMs = 3000, now = () => new Date() }) -> { pollOnce(): Promise<void>, start(): void, stop(): void, snapshot(): Snapshot, queryCount(): number }`. `query(server, timeoutMs) -> Promise<gamedigState>`.
  - `Snapshot = { updatedAt: string|null, summary: { online, total, players }, servers: ServerStatus[] }` (servers in config order; before the first poll: all `initialStatus`, `updatedAt: null`).
  - `query.js`: `gamedigQuery(server, timeoutMs)` calling `GameDig.query({ type, host, port, socketTimeout: timeoutMs, attemptTimeout: timeoutMs, maxRetries: 1 })`.
  - `probe.js`: CLI that runs one poll with `gamedigQuery` over `servers.json` and prints the snapshot as JSON.

- [ ] **Step 1: Write failing tests** (`query` is a fake; use `timeoutMs: 50`):
  - `snapshot before first poll is all offline with updatedAt null`
  - `pollOnce fills statuses and updatedAt` — fake resolves `{ map: "m", numplayers: 1, maxplayers: 8, bots: [], players: [] }` → every server `online: true`, `updatedAt` = injected `now()` ISO.
  - `query rejection marks only that server offline` — reject for `cs-gungame` only → that one `online: false`, others `true`.
  - `hanging query does not block the poll` — one fake never resolves; `await pollOnce()` finishes in < 500 ms and that server is offline.
  - `polls run concurrently` — fake resolving after 40 ms each for 6 servers; `pollOnce` < 150 ms.
  - `queryCount counts only real queries` — after one `pollOnce`, `queryCount() === 6`; reading `snapshot()` 100 times leaves it at 6.

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Implement** `createPoller` (wrap each query in a `Promise.race` with its own timeout, use `Promise.allSettled`; `start()` polls immediately then on `setInterval`, timer `unref()`'d; overlapping polls are skipped while one is running), `gamedigQuery`, and `probe.js`.

- [ ] **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Network check from the Dokploy VM** (spec early check): copy `apps/lan-status` to VM 420 and run the probe in a throwaway container, e.g. from base42:
  `tar -C apps/lan-status -czf - . | qm guest exec 420 --pass-stdin 1 -- bash -c 'd=$(mktemp -d); tar -xzf - -C $d; docker run --rm -v $d:/app -w /app node:24-alpine node src/probe.js; rm -rf $d'`
  Expected: all six servers `online: true` with maps; CS GunGame/Classic show `bots` > 0. If a gamedig type returns nothing, switch that entry in `servers.json` (e.g. the open.mp type for `samp`) and re-run.

- [ ] **Step 6: Commit** `git add apps/lan-status && git commit -m "lan-status: gamedig poller"`.

---

### Task 3: HTTP server and status page

**Files:**
- Create: `apps/lan-status/src/server.js`, `apps/lan-status/src/main.js`, `apps/lan-status/public/index.html`, `apps/lan-status/public/app.js`, `apps/lan-status/public/style.css`
- Test: `apps/lan-status/test/server.test.js`

**Interfaces:**
- Consumes: `createPoller` (Task 2), `gamedigQuery` (Task 2).
- Produces: `createServer({ poller, publicDir }) -> http.Server`. Routes: `GET /` → `index.html`; `GET /app.js`, `GET /style.css` → static; `GET /api/status` → `poller.snapshot()` as JSON with `Cache-Control: no-store`; `GET /healthz` → `200 ok`; everything else `404`. `main.js` reads `PORT` (default `3000`) and `SERVERS_FILE` (default `../servers.json`), starts the poller and the server, handles `SIGTERM`.

- [ ] **Step 1: Write failing tests** (server on port 0, fake poller with fixed snapshot and a `queryCount` stub):
  - `GET /api/status returns the snapshot as JSON` (status 200, `content-type` starts with `application/json`, body deep-equals snapshot).
  - `GET /api/status does not query servers` — 20 requests, fake poller's `pollOnce` never called.
  - `GET / serves the page with security headers` — 200, `text/html`, has `X-Content-Type-Options: nosniff` and a `Content-Security-Policy` containing `default-src 'self'`.
  - `unknown and traversal paths return 404` — `/servers.json`, `/../package.json`, `/%2e%2e/package.json`, `/src/main.js`, `/api/other` all 404.
  - `GET /healthz returns 200`.
  - `index.html contains no inline data` — the file has no `<script>` with inline code (only `<script src="/app.js" defer>`).

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Implement** `server.js` (fixed route table, no filesystem path built from the URL) and `main.js`.

- [ ] **Step 4: Build the page**: header "42.mk LAN" with the summary line ("N of M servers online · P players"), one card per server (name, status dot online/offline, map, `players/maxPlayers` and "+ B bots" when bots > 0, join address), "updated Ns ago" from `updatedAt`, re-fetch `/api/status` every 15 s; while `updatedAt` is null show "checking servers…". All values inserted with `textContent`/DOM APIs, never `innerHTML`. Responsive single column on phones; respects `prefers-color-scheme`. No external assets.

- [ ] **Step 5: Run** `npm test` → PASS. Then run locally against the real servers from base42: `mise exec -C apps/lan-status -- npm start` and in another shell `curl -s localhost:3000/api/status` → six servers, `updatedAt` set after ~3 s. (base42 is on the LAN.)

- [ ] **Step 6: Commit** `git add apps/lan-status && git commit -m "lan-status: http server and status page"`.

---

### Task 4: Container image

**Files:**
- Create: `apps/lan-status/Dockerfile`, `apps/lan-status/.dockerignore` (`node_modules`, `test`, `.git*`)

**Interfaces:**
- Produces: image that runs `node src/main.js` as user `node` on port 3000, `HEALTHCHECK` hitting `http://127.0.0.1:3000/healthz` (busybox `wget` in alpine), `NODE_ENV=production`, `npm ci --omit=dev` from the lockfile.

- [ ] **Step 1: Write the Dockerfile** on `node:24-alpine` with the interface above (no build stage needed).

- [ ] **Step 2: Build and run it on the Dokploy VM** (has Docker; same network position as production), from base42:
  `tar -C apps/lan-status -czf - . | qm guest exec 420 --pass-stdin 1 -- bash -c 'd=$(mktemp -d); tar -xzf - -C $d; docker build -q -t lan-status:test $d && docker run -d --rm --name lan-status-test -p 127.0.0.1:3999:3000 lan-status:test; sleep 8; curl -s 127.0.0.1:3999/api/status; docker inspect -f "{{.State.Health.Status}}" lan-status-test; docker rm -f lan-status-test; docker rmi lan-status:test; rm -rf $d'`
  Expected: JSON with six servers online; health `healthy` (or `starting` if within the first interval – then re-check once).

- [ ] **Step 3: Commit** `git add apps/lan-status && git commit -m "lan-status: container image"`.

---

### Task 5: Pulumi component, deploy and end-to-end check

**Files:**
- Create: `dokploy/lan-status/index.ts`
- Modify: `dokploy/index.ts` (instantiate component, export URL), `dokploy/tsconfig.json` (`files` += `lan-status/index.ts`), `dokploy/Pulumi.prod.yaml` via `pulumi config set` only, `mise.toml` (task `lan-status:test`)

**Interfaces:**
- Consumes: Dockerfile at `apps/lan-status/Dockerfile` (Task 4).
- Produces: `class LanStatus extends pulumi.ComponentResource` (type `base42:dokploy:LanStatus`) with args `{ host: string, repoUrl: string, branch: string, appDir: string /* repo-relative, "apps/lan-status" */ }` and output `url`. Creates `dokploy.Project` "lan-status", `dokploy.Application` (`source: { type: "git", git: { url: repoUrl, branch, buildPath: "/" + appDir, build: { type: "dockerfile", dockerfile: "Dockerfile", dockerContextPath: "." } } }`, `environment: "APP_REVISION=<hash>\n"`), `dokploy.Domain` (`applicationId`, `host`, `port: 3000`, `https: false`, `certificateType: "none"`).
  - `APP_REVISION`: sha256 over the sorted relative paths + contents of all git-tracked files under `appDir` (read with Node `fs` from `../apps/lan-status`, skipping `node_modules`), computed at program run time.

- [ ] **Step 1: Config**: `cd dokploy && mise exec -- pulumi config set lan-status:host lan.apps.42.mk` (and `repoUrl`/`branch` as code defaults from Global Constraints).

- [ ] **Step 2: Implement** the component and wire it in `index.ts` (export `lanStatusUrl`). Add mise task `lan-status:test` (`dir = "{{config_root}}/apps/lan-status"`, `run = "npm test"`).

- [ ] **Step 3: Type-check**: `mise exec -C dokploy -- npx tsc --noEmit` → no errors. `mise run lan-status:test` → PASS.

- [ ] **Step 4: Commit** `git add dokploy apps mise.toml && git commit -m "lan-status: Dokploy app via Pulumi"`, then **ask the user to push** (`git push` from `/root/hydrodactyl-infra`) – Dokploy clones from GitHub `main`. Wait for confirmation; check with `git status -sb` that `main` is not ahead of `origin/main`.

- [ ] **Step 5: Preview**: `mise run dokploy:preview` → creates Project, Application, Domain under `base42:dokploy:LanStatus`; **no** changes to the Hydrodactyl resources. Show the preview to the user before applying.

- [ ] **Step 6: Apply**: `mise run dokploy:up --yes`. Expected: Application `done`.

- [ ] **Step 7: End-to-end check** (spec verification):
  - Within ~1 min `/etc/caddy/dokploy.d/generated.caddy` on base42 contains `lan.apps.42.mk` (dokploy-caddy-sync picks up Application domains).
  - `curl -s https://lan.apps.42.mk/api/status` → six servers with correct online/map/players, `updatedAt` recent; cross-check one server against a direct A2S query.
  - Open https://lan.apps.42.mk in the DevTools browser: cards render, "updated Ns ago" ticks, no console errors, no requests to other hosts (network panel).
  - Re-run `mise run dokploy:preview` → no changes (idempotent).
