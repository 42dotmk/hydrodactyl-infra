# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who are thinking about coming to the 42.mk LAN party. They open the page – often on a phone,
before leaving home or while walking in – to decide whether something is happening right now.

## Product Purpose

A public status board at https://lan.apps.42.mk. It answers three questions at a glance: is anything
running, how full is it, which map is on. Success: a visitor knows in a few seconds whether it is worth
coming over and which server to join.

## Positioning

It is the live state of the actual 42.mk LAN servers on the office network – not a listing site, not
an event page. Only this page knows what is running on 192.168.101.39 right now.

## Operating Context

- Servers: CS 1.6 Classic, GunGame and Deathrun; Half-Life 2: Deathmatch; GTA San Andreas (SA-MP via
  open.mp); Minecraft (Paper); CS 1.6 Zombie Plague.
- Joining happens from inside the LAN using the address shown (192.168.101.39:<port>).
- Data refreshes every 15 s from a server-side poll (gamedig); visitors never trigger game-server queries.

## Capabilities and Constraints

- Shows per server: name, online/offline (or "checking…" before the first poll), map, human players /
  max, bots separately, join address; a summary line and "updated N ago".
- No player names, SteamIDs or per-player data (public page). No event info (dates, location, sign-up).
- Self-contained: no external fonts, CDNs or analytics (CSP `default-src 'self'`); values rendered via
  `textContent` only.
- Static HTML/CSS/vanilla JS served by the Node service in this directory; deployed via Dokploy + Pulumi.

## Brand Commitments

- Name: "42.mk LAN".
- Visual brief (user, 2026-10-21): simple, no cards, hacky looking – evoking an old-school LAN party
  website (early-2000s clan/LAN site or server browser). Not the fake Matrix / neon-glow cliché, and
  it must stay easy to read on a phone.

## Evidence on Hand

Live server data only. No photos, logos, testimonials or event history exist; do not invent them.

## Product Principles

1. The current state is the content – nothing on the page competes with "what's running now".
2. Honest status: "checking…" is not "offline", stale data says how stale it is.
3. Readable anywhere, especially on a phone at a glance.
4. Nothing personal about players leaves the server.
