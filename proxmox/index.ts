import * as pulumi from "@pulumi/pulumi";
import * as proxmox from "@muhlba91/pulumi-proxmoxve";
import { WingsNode } from "./wings";

const nodeName = "pve";

// Ubuntu 24.04 cloud image, pinned to a dated release so a new "current" never forces a VM rebuild.
// Stored as `import` content (.qcow2 name required) so VMs can importFrom it through the API.
const ubuntuNoble = new proxmox.download.File("ubuntu-24.04-cloudimg", {
    nodeName,
    datastoreId: "local",
    contentType: "import",
    url: "https://cloud-images.ubuntu.com/releases/noble/release-20261017/ubuntu-24.04-server-cloudimg-amd64.img",
    fileName: "ubuntu-24.04-server-cloudimg-amd64-20261017.qcow2",
    checksum: "04e8f2461a16a44e78a370284471f29616cdd9baf1893df25807b71f985b6c94",
    checksumAlgorithm: "sha256",
    overwrite: false,
});

const wingsConfig = new pulumi.Config("wings");
const wings = new WingsNode(wingsConfig.require("name"), {
    nodeName,
    vmId: wingsConfig.requireNumber("vmId"),
    cores: wingsConfig.requireNumber("cores"),
    memoryMb: wingsConfig.requireNumber("memoryMb"),
    diskGb: wingsConfig.requireNumber("diskGb"),
    address: wingsConfig.require("address"),
    lanMacAddress: wingsConfig.require("lanMacAddress"),
    publicHost: wingsConfig.require("publicHost"),
    wingsVersion: wingsConfig.require("version"),
    imageId: ubuntuNoble.id,
});

export const wingsVmId = wings.vmId;
export const wingsAddress = wings.address;
export const wingsPublicUrl = `https://${wingsConfig.require("publicHost")}`;
export const wingsSshPrivateKey = wings.sshPrivateKey;
