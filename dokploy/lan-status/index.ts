import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as pulumi from "@pulumi/pulumi";
import * as dokploy from "@dimeskigj/pulumi-dokploy";

export interface LanStatusArgs {
    /** Public hostname. Caddy on base42 picks it up from Dokploy and terminates TLS. */
    host: string;
    /** Public Git repository Dokploy clones and builds from. */
    repoUrl: string;
    branch: string;
    /** Repo-relative app directory containing the Dockerfile, e.g. "apps/lan-status". */
    appDir: string;
}

const repoRoot = path.join(__dirname, "..", "..");

// Content hash of the app directory: passed to Dokploy as an env var so a code change shows up as a
// diff and redeploys. The code itself comes from GitHub, so push before `up`.
function hashDir(dir: string): string {
    const hash = crypto.createHash("sha256");
    const walk = (rel: string) => {
        for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name === "node_modules") continue;
            const child = path.join(rel, entry.name);
            if (entry.isDirectory()) walk(child);
            else {
                hash.update(child).update("\0").update(fs.readFileSync(path.join(dir, child))).update("\0");
            }
        }
    };
    walk("");
    return hash.digest("hex");
}

/** Public status board for the LAN game servers (apps/lan-status), built by Dokploy from Git. */
export class LanStatus extends pulumi.ComponentResource {
    public readonly url: pulumi.Output<string>;

    constructor(name: string, args: LanStatusArgs, opts?: pulumi.ComponentResourceOptions) {
        super("base42:dokploy:LanStatus", name, {}, opts);
        const parent = { parent: this };

        const project = new dokploy.Project(name, {
            name: "lan-status",
            description: "Public LAN game server status board - managed by Pulumi (/root/hydrodactyl-infra)",
        }, parent);

        const app = new dokploy.Application(name, {
            environmentId: project.defaultEnvironmentId,
            name: "lan-status",
            appName: "lan-status",
            description: "Managed by Pulumi - changes in the Dokploy UI will be overwritten",
            source: {
                type: "git",
                git: {
                    url: args.repoUrl,
                    branch: args.branch,
                    buildPath: `/${args.appDir}`,
                    build: { type: "dockerfile", dockerfile: "Dockerfile", dockerContextPath: "." },
                },
            },
            environment: `APP_REVISION=${hashDir(path.join(repoRoot, args.appDir))}\n`,
        }, parent);

        new dokploy.Domain(name, {
            applicationId: app.applicationId,
            host: args.host,
            port: 3000,
            // Caddy (dokploy-caddy-sync on base42) owns TLS and forwards plain HTTP to Traefik.
            https: false,
            certificateType: "none",
        }, parent);

        this.url = pulumi.output(`https://${args.host}`);
        this.registerOutputs({ url: this.url });
    }
}
