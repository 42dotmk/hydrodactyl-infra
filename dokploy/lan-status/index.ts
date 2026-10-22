import * as path from "path";
import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";
import * as dokploy from "@dimeskigj/pulumi-dokploy";
import { appRevision } from "./revision";

export interface LanStatusArgs {
    /** Public hostname. Caddy on base42 picks it up from Dokploy and terminates TLS. */
    host: string;
    /** Public Git repository Dokploy clones and builds from. */
    repoUrl: string;
    branch: string;
    /** Repo-relative app directory containing the Dockerfile, e.g. "apps/lan-status". */
    appDir: string;
    /** squaremap's web server on the Minecraft server, proxied at /map/ for the Map tab (games/minecraft). */
    mapUpstream: string;
    /** CS leaderboard exporter on wings-01 (games/cs16/stats), polled for /api/stats and the Stats tab. */
    statsUpstream: string;
}

const repoRoot = path.join(__dirname, "..", "..");

/** Public status board for the LAN game servers (apps/lan-status), built by Dokploy from Git. */
export class LanStatus extends pulumi.ComponentResource {
    public readonly url: pulumi.Output<string>;

    constructor(name: string, args: LanStatusArgs, opts?: pulumi.ComponentResourceOptions) {
        super("base42:dokploy:LanStatus", name, {}, opts);
        const parent = { parent: this };

        // Deploys follow the app's tree on origin/<branch> (what Dokploy builds), not local files.
        const { revision, upToDate } = appRevision(repoRoot, args.branch, args.appDir);
        if (!upToDate) {
            pulumi.log.warn(`${args.appDir} has changes that are not on origin/${args.branch}; Dokploy builds from GitHub, so push first and re-run`, this);
        }

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
                    // No dockerContextPath: Dokploy then uses the Dockerfile's directory (the build path).
                    // "." resolved to an empty directory, not to the build path.
                    build: { type: "dockerfile", dockerfile: "Dockerfile" },
                },
            },
            environment: `MAP_UPSTREAM=${args.mapUpstream}\nSTATS_UPSTREAM=${args.statsUpstream}\n`,
        }, parent);

        // Updating the Application only makes Dokploy *redeploy*, which rebuilds the old checkout
        // without cloning. application.deploy clones origin/<branch> first, so call it whenever the
        // app's tree changes. On a fresh create this queues a second (identical) build; harmless.
        const dokployConfig = new pulumi.Config("dokploy");
        new command.local.Command(`${name}-deploy`, {
            create: `curl -fsS -o /dev/null -X POST "$DOKPLOY_ENDPOINT/api/application.deploy" -H "x-api-key: $DOKPLOY_API_KEY" -H "content-type: application/json" -d "{\\"applicationId\\":\\"$APPLICATION_ID\\"}"`,
            environment: {
                DOKPLOY_ENDPOINT: dokployConfig.require("endpoint"),
                DOKPLOY_API_KEY: dokployConfig.requireSecret("apiKey"),
                APPLICATION_ID: app.applicationId,
            },
            triggers: [revision],
        }, { parent: this, dependsOn: [app] });

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
