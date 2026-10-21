import * as pulumi from "@pulumi/pulumi";
import { Hydrodactyl } from "./hydrodactyl";

const hydrodactylConfig = new pulumi.Config("hydrodactyl");

const hydrodactyl = new Hydrodactyl("hydrodactyl", {
    host: hydrodactylConfig.require("host"),
    image: hydrodactylConfig.require("image"),
    timezone: hydrodactylConfig.get("timezone") ?? "UTC",
    serviceAuthor: hydrodactylConfig.require("serviceAuthor"),
});

export const hydrodactylUrl = hydrodactyl.url;
export const hydrodactylComposeId = hydrodactyl.composeId;
