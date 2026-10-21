// Run: mise exec -C dokploy -- node --test lan-status/revision.test.ts  (Node 24 strips the types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appRevision } from "./revision.ts";

function git(cwd: string, ...args: string[]): string {
    return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" }).trim();
}

// A work repo whose "origin" is a local bare repo, with apps/web committed and pushed to main.
function fixture() {
    const root = mkdtempSync(join(tmpdir(), "revision-"));
    const origin = join(root, "origin.git");
    const work = join(root, "work");
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
    execFileSync("git", ["clone", "-q", origin, work]);
    mkdirSync(join(work, "apps/web"), { recursive: true });
    writeFileSync(join(work, "apps/web/index.js"), "v1\n");
    git(work, "checkout", "-q", "-b", "main");
    git(work, "add", ".");
    git(work, "commit", "-q", "-m", "v1");
    git(work, "push", "-q", "origin", "main");
    return { root, work };
}

test("revision is the app's tree hash on the remote branch", () => {
    const { root, work } = fixture();
    try {
        const r = appRevision(work, "main", "apps/web");
        assert.equal(r.revision, git(work, "rev-parse", "origin/main:apps/web"));
        assert.equal(r.upToDate, true);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unpushed or uncommitted app changes keep the deployed revision and are flagged", () => {
    const { root, work } = fixture();
    try {
        const before = appRevision(work, "main", "apps/web").revision;
        writeFileSync(join(work, "apps/web/index.js"), "v2\n");
        const dirty = appRevision(work, "main", "apps/web");
        assert.equal(dirty.revision, before, "revision must follow what Dokploy builds, not the working tree");
        assert.equal(dirty.upToDate, false);
        git(work, "commit", "-q", "-am", "v2");
        assert.equal(appRevision(work, "main", "apps/web").upToDate, false, "committed but not pushed");
        git(work, "push", "-q", "origin", "main");
        const pushed = appRevision(work, "main", "apps/web");
        assert.notEqual(pushed.revision, before);
        assert.equal(pushed.upToDate, true);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an app that is not on the remote yet asks for a push", () => {
    const { root, work } = fixture();
    try {
        mkdirSync(join(work, "apps/new"), { recursive: true });
        writeFileSync(join(work, "apps/new/index.js"), "x\n");
        assert.throws(() => appRevision(work, "main", "apps/new"), /apps\/new is not on origin\/main yet.*push/);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("outside a git repository it fails loudly", () => {
    const dir = mkdtempSync(join(tmpdir(), "norepo-"));
    try {
        assert.throws(() => appRevision(dir, "main", "apps/web"), /git/i);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
