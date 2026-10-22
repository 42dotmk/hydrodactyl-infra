import * as pulumi from "@pulumi/pulumi";
import { Hydrodactyl } from "./hydrodactyl";
import { LanStatus } from "./lan-status";

const hydrodactylConfig = new pulumi.Config("hydrodactyl");

const hydrodactyl = new Hydrodactyl("hydrodactyl", {
    host: hydrodactylConfig.require("host"),
    image: hydrodactylConfig.require("image"),
    timezone: hydrodactylConfig.get("timezone") ?? "UTC",
    serviceAuthor: hydrodactylConfig.require("serviceAuthor"),
});

export const hydrodactylUrl = hydrodactyl.url;
export const hydrodactylComposeId = hydrodactyl.composeId;

const lanStatusConfig = new pulumi.Config("lan-status");
const lanStatus = new LanStatus("lan-status", {
    host: lanStatusConfig.require("host"),
    repoUrl: lanStatusConfig.get("repoUrl") ?? "https://github.com/42dotmk/hydrodactyl-infra.git",
    branch: lanStatusConfig.get("branch") ?? "main",
    appDir: "apps/lan-status",
    mapUpstream: lanStatusConfig.get("mapUpstream") ?? "http://192.168.101.39:25566",
    statsUpstream: lanStatusConfig.get("statsUpstream") ?? "http://192.168.101.39:8790",
});

export const lanStatusUrl = lanStatus.url;
