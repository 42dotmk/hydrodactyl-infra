import { execFileSync } from "child_process";

export interface AppRevision {
    /** Git tree hash of appDir on origin/<branch> - exactly what Dokploy clones and builds. */
    revision: string;
    /** False if the local appDir has uncommitted, untracked or unpushed changes. */
    upToDate: boolean;
}

// Dokploy builds from GitHub, not from this working tree. Keying redeploys on the remote tree means
// an `up` before a push cannot record code that was never built; upToDate lets the caller warn.
export function appRevision(repoRoot: string, branch: string, appDir: string): AppRevision {
    const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    try {
        git("rev-parse", "--is-inside-work-tree");
    } catch {
        throw new Error(`git: ${repoRoot} is not a git repository; cannot tell what Dokploy will build`);
    }
    try {
        git("fetch", "--quiet", "origin", branch);
    } catch {
        // offline: fall back to the last fetched origin/<branch>
    }
    const remote = `origin/${branch}`;
    let revision: string;
    try {
        revision = git("rev-parse", `${remote}:${appDir}`);
    } catch {
        throw new Error(`${appDir} is not on ${remote} yet - Dokploy builds from GitHub, push first`);
    }
    const clean = git("status", "--porcelain", "--", appDir) === "";
    let pushed = true;
    try {
        git("diff", "--quiet", remote, "HEAD", "--", appDir);
    } catch {
        pushed = false;
    }
    return { revision, upToDate: clean && pushed };
}
