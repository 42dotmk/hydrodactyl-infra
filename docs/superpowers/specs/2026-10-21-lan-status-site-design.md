# LAN status site (lan.apps.42.mk) – design

Date: 2026-10-21 · Repo: `/opt/pulumi` on base42 (`github.com:42dotmk/hydrodactyl-infra`)

## Intent

A small public web page at **https://lan.apps.42.mk** for people who are thinking about coming to the
42.mk LAN party. They open it to see, at a glance, whether something is happening right now: which game
servers are up, how many people are playing on each, and which map is running. It is a live status
board, nothing more.

## Goals

- One page listing every LAN game server with: game/mode name, online/offline, current map, players
  (current/max, bots shown separately where the protocol reports them), and the address to join from
  inside the LAN.
- A headline summary at the top (e.g. "3 of 6 servers online · 14 players").
- Data refreshes on its own (no manual reload), with a visible "updated N seconds ago".
- Server list is configuration, not code, so adding the planned Biohazard server (port 27020) or a new
  game is a one-line change.
- Deployed and updated entirely through the existing Pulumi setup (`mise run dokploy:up`).

## Non-goals

- No player names, SteamIDs or per-player data (public internet page). *(Claude's call, from the
  "mostly glanceable stats" playback the user agreed to.)*
- No event information (dates, location, sign-up). Purely a status board. *(Claude's call; easy to add
  later.)*
- No history, graphs, accounts, admin actions or server control.

## Anti-goals (would make it a failure even if it "works")

- Visitors must never cause queries to the game servers. Queries happen on a fixed server-side
  schedule and the page only reads a cached result – a busy page or a bot hammering it must not
  translate into traffic against the game servers.
- An offline or slow game server must not break or stall the page; it shows as offline.
- No third-party requests from the browser (no CDNs, fonts, analytics). Self-contained.
- No secrets in the repo or the image.

## Servers to show (initial configuration)

All on the Wings node, LAN address 192.168.101.39 (static DHCP lease).

| Display name | Port | gamedig type |
|---|---|---|
| CS 1.6 Classic | 27015 | `counterstrike16` |
| CS 1.6 GunGame | 27018 | `counterstrike16` |
| CS 1.6 Deathrun | 27019 | `counterstrike16` |
| Half-Life 2: Deathmatch | 27016 | `hl2d` |
| GTA San Andreas (SA-MP / open.mp) | 27017 | `gtasam` (or gamedig's open.mp entry if it reports better) |
| Minecraft (Paper) | 25565 | `minecraft` |

(Biohazard on 27020 is planned; add it to the config when that server exists.)

## Constraints and decided "how"

- **Code location:** everything lives in the `/opt/pulumi` repo: the app under `apps/lan-status/`,
  its Pulumi component under `dokploy/` next to `hydrodactyl/`. *(User: "add everything to the pulumi
  directory".)*
- **Query library:** `gamedig` (node-gamedig, currently 5.3.x, ESM). *(User's choice.)*
- **Runtime:** Node 24 LTS (same major as the repo's mise toolchain), small HTTP server, plain HTML/CSS
  and vanilla JS for the page. No frontend framework, no build step. *(Claude's call: tiny scope.)*
- **Polling:** the server queries all servers concurrently every ~15 s with a short per-query timeout
  (~3 s), keeps the latest results in memory and serves them as JSON (`GET /api/status`); the page
  re-fetches that endpoint every ~15 s. *(Claude's call; exact numbers left to the builder within this
  range.)*
- **Hosting:** a Dokploy **Application** on the base42 Dokploy (VM 420, `http://10.10.0.249:3000`),
  managed with `pulumi-dokploy` in the existing `dokploy` Pulumi project/stack. The Dokploy VM can
  reach 192.168.101.39 directly on the LAN (UDP for the Valve/SA-MP queries, TCP for Minecraft).
- **Source delivery (Claude's call):** Dokploy builds the app from this Git repo using its Dockerfile
  (`apps/lan-status/Dockerfile`):
  - The repo is **public** (user, 2026-10-21), so Dokploy clones it over HTTPS
    (`https://github.com/42dotmk/hydrodactyl-infra.git`, branch `main`) – no deploy key needed.
  - Code changes must be pushed to GitHub before `mise run dokploy:up`.
  - Pulumi passes a content hash of `apps/lan-status/` to the Application (e.g. as an env var) so that
    a code change causes a redeploy on the next `up`.
- **Public access:** Dokploy domain `lan.apps.42.mk`, **HTTP only, no certificate** in Dokploy
  (`https: false`, `certificateType: none`) – exactly like Hydrodactyl. DNS (`*.apps.42.mk` wildcard)
  and TLS are already handled: `dokploy-caddy-sync` on base42 picks the domain up within a minute and
  Caddy obtains the certificate.
- **Container:** small Node image, runs as non-root, has a healthcheck, no persistent volume needed.
- **Connect addresses:** shown on the page as `192.168.101.39:<port>` (useful at the party; the LAN IP
  being visible publicly is acceptable). *(Claude's call.)*

## Rollout order and early checks

- **Push before deploy:** the app code must be on GitHub `main` before the first `up`.
- **Verify early, before building the UI:** a container on the Dokploy VM can query 192.168.101.39 over
  UDP/TCP (the Wings egress firewall only blocks *new* outbound connections from game containers, so
  query replies should pass); the gamedig type ids above return data; `dokploy-caddy-sync` picks up a
  domain on an Application (so far only used with a Compose).
- If changing the Application's environment does not redeploy, use the same explicit
  `compose.redeploy`-style API call the Hydrodactyl component uses (here: the application redeploy
  endpoint).

## Left to the builder

- Visual design (a clean, readable card/list layout that works on phones; light/dark is a nice-to-have).
- File layout inside `apps/lan-status/`, config format (e.g. `servers.json`), exact intervals/timeouts.
- How exactly the content hash reaches Dokploy, and the precise `pulumi-dokploy` Application/Domain
  inputs (check the provider docs/source).
- Tests: at least unit tests (Node's built-in `node:test`) for turning gamedig results and failures
  into the status JSON; after deploy, verify `https://lan.apps.42.mk/api/status` lists all six servers
  with correct online/player data.
