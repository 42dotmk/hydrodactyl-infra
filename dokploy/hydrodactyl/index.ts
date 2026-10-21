import * as fs from "fs";
import * as path from "path";
import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";
import * as random from "@pulumi/random";
import * as dokploy from "@dimeskigj/pulumi-dokploy";

export interface HydrodactylArgs {
    /** Public hostname. Caddy on base42 picks it up from Dokploy and terminates TLS. */
    host: string;
    image: string;
    timezone: string;
    serviceAuthor: string;
}

const composeFile = fs.readFileSync(path.join(__dirname, "docker-compose.yml"), "utf8");

export class Hydrodactyl extends pulumi.ComponentResource {
    public readonly url: pulumi.Output<string>;
    public readonly composeId: pulumi.Output<string>;

    constructor(name: string, args: HydrodactylArgs, opts?: pulumi.ComponentResourceOptions) {
        super("base42:dokploy:Hydrodactyl", name, {}, opts);
        const parent = { parent: this };

        const dbPassword = new random.RandomPassword(`${name}-db`, { length: 32, special: false }, parent);
        const dbRootPassword = new random.RandomPassword(`${name}-db-root`, { length: 32, special: false }, parent);

        const project = new dokploy.Project(name, {
            name: "hydrodactyl",
            description: "Hydrodactyl game server panel - managed by Pulumi (/opt/pulumi)",
        }, parent);

        const compose = new dokploy.Compose(name, {
            environmentId: project.defaultEnvironmentId,
            name: "hydrodactyl",
            appName: "hydrodactyl",
            description: "Managed by Pulumi - changes in the Dokploy UI will be overwritten",
            source: { type: "raw", raw: { composeFile } },
            createEnvFile: true,
            deleteVolumesOnDestroy: false,
            environment: pulumi.interpolate`HYDRODACTYL_IMAGE=${args.image}
APP_URL=https://${args.host}
APP_TIMEZONE=${args.timezone}
APP_SERVICE_AUTHOR=${args.serviceAuthor}
DB_PASSWORD=${dbPassword.result}
DB_ROOT_PASSWORD=${dbRootPassword.result}
`,
        }, parent);

        const domain = new dokploy.Domain(name, {
            composeId: compose.composeId,
            serviceName: "hydrodactyl-panel",
            host: args.host,
            port: 80,
            // Caddy (dokploy-caddy-sync on base42) owns TLS and forwards plain HTTP to Traefik.
            https: false,
            certificateType: "none",
        }, parent);

        // Dokploy only injects compose domain labels on deploy, so redeploy when the domain changes.
        // Safe right after create: the hydrodactyl-ready gate keeps the first deploy "running"
        // until migrations are done, and the Compose resource waits for that.
        const dokployConfig = new pulumi.Config("dokploy");
        new command.local.Command(`${name}-redeploy`, {
            create: `curl -fsS -o /dev/null -X POST "$DOKPLOY_ENDPOINT/api/compose.redeploy" -H "x-api-key: $DOKPLOY_API_KEY" -H "content-type: application/json" -d "{\\"composeId\\":\\"$COMPOSE_ID\\"}"`,
            environment: {
                DOKPLOY_ENDPOINT: dokployConfig.require("endpoint"),
                DOKPLOY_API_KEY: dokployConfig.requireSecret("apiKey"),
                COMPOSE_ID: compose.composeId,
            },
            triggers: [domain.id, args.host],
        }, { parent: this, dependsOn: [domain] });

        this.url = pulumi.output(`https://${args.host}`);
        this.composeId = compose.composeId;
        this.registerOutputs({ url: this.url, composeId: this.composeId });
    }
}
