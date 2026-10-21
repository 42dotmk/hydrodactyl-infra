import * as fs from "fs";
import * as path from "path";
import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";
import * as proxmox from "@muhlba91/pulumi-proxmoxve";
import * as tls from "@pulumi/tls";

export interface WingsNodeArgs {
    nodeName: string;
    vmId: number;
    cores: number;
    memoryMb: number;
    diskGb: number;
    /** Static address on vnet01, e.g. 10.10.0.250/24 (outside the SDN DHCP range .2-.220). */
    address: string;
    /** Fixed MAC for the LAN NIC (DHCP), so the MikroTik can pin it with a static lease. */
    lanMacAddress: string;
    /** Public name for the Wings API; Caddy on this host terminates TLS for it. */
    publicHost: string;
    wingsVersion: string;
    /** Cloud image to import the boot disk from (`import` content). */
    imageId: pulumi.Input<string>;
}

const userDataTemplate = fs.readFileSync(path.join(__dirname, "user-data.yaml"), "utf8");
const installScript = fs.readFileSync(path.join(__dirname, "install-wings.sh"), "utf8");
const egressFirewallScript = fs.readFileSync(path.join(__dirname, "egress-firewall.sh"), "utf8");

/** A Pterodactyl Wings node VM for Hydrodactyl: VM, cloud-init bootstrap, then Docker + Wings over SSH. */
export class WingsNode extends pulumi.ComponentResource {
    public readonly vmId: pulumi.Output<number>;
    public readonly address: pulumi.Output<string>;
    public readonly sshPrivateKey: pulumi.Output<string>;

    constructor(name: string, args: WingsNodeArgs, opts?: pulumi.ComponentResourceOptions) {
        super("base42:proxmox:WingsNode", name, {}, opts);
        const parent = { parent: this };
        const host = args.address.split("/")[0];

        const sshKey = new tls.PrivateKey(`${name}-ssh`, { algorithm: "ED25519" }, parent);

        // Custom cloud-init user-data must be a snippet on the node. Pulumi runs on this Proxmox host,
        // so the snippet is written locally (the API cannot upload snippets).
        const snippetsContent = new command.local.Command(`${name}-snippets-content`, {
            create: [
                `content=$(pvesh get /storage/local --output-format json | python3 -c 'import json,sys;print(json.load(sys.stdin)["content"])')`,
                `case ",$content," in *,snippets,*) ;; *) pvesm set local --content "$content,snippets" ;; esac`,
            ].join("\n"),
        }, parent);
        const snippetFile = `${name}-user-data.yaml`;
        const userData = new command.local.Command(`${name}-user-data`, {
            create: `install -d /var/lib/vz/snippets && printf '%s' "$USER_DATA" > /var/lib/vz/snippets/${snippetFile}`,
            delete: `rm -f /var/lib/vz/snippets/${snippetFile}`,
            environment: {
                USER_DATA: sshKey.publicKeyOpenssh.apply(key => userDataTemplate.replace("__SSH_PUBLIC_KEY__", key.trim())),
            },
        }, { parent: this, dependsOn: [snippetsContent] });

        const vm = new proxmox.VmLegacy(name, {
            nodeName: args.nodeName,
            vmId: args.vmId,
            name,
            description: "Pterodactyl Wings node for Hydrodactyl (hydrodactyl.apps.42.mk). Managed by Pulumi in /root/hydrodactyl-infra/proxmox.",
            tags: ["pulumi", "wings"],
            onBoot: true,
            started: true,
            stopOnDestroy: true,
            operatingSystem: { type: "l26" },
            agent: { enabled: true, trim: true },
            cpu: { cores: args.cores, type: "host" },
            memory: { dedicated: args.memoryMb },
            scsiHardware: "virtio-scsi-single",
            // The provider's default CD-ROM is the host's physical drive, which base42 lacks (QEMU won't start).
            cdrom: { fileId: "none" },
            bootOrders: ["scsi0"],
            disks: [{
                interface: "scsi0",
                datastoreId: "local-lvm",
                importFrom: args.imageId,
                size: args.diskGb,
                iothread: true,
                discard: "on",
                ssd: true,
            }],
            // net0: office LAN via DHCP (default route; target of the MikroTik game/SFTP forwards).
            // net1: vnet01 with a static address and no gateway, for Caddy and Pulumi on this host.
            networkDevices: [
                { bridge: "vmbr0", model: "virtio", macAddress: args.lanMacAddress },
                { bridge: "vnet01", model: "virtio" },
            ],
            initialization: {
                datastoreId: "local-lvm",
                ipConfigs: [
                    { ipv4: { address: "dhcp" } },
                    { ipv4: { address: args.address } },
                ],
                dns: { servers: ["192.168.100.1", "1.1.1.1"] },
                userDataFileId: `local:snippets/${snippetFile}`,
            },
        }, {
            parent: this,
            dependsOn: [userData],
            // The provider reports an all-zero (= unlimited) speed block as drift after refresh.
            ignoreChanges: ["disks[0].speed"],
        });

        const install = new command.remote.Command(`${name}-install-wings`, {
            connection: { host, user: "ubuntu", privateKey: sshKey.privateKeyOpenssh, dialErrorLimit: 30 },
            create: `sudo WINGS_VERSION=${args.wingsVersion} bash -s`,
            stdin: installScript,
            triggers: [vm.id, args.wingsVersion, installScript],
        }, parent);

        // Game servers run third-party code; keep a compromised one from reaching the office LAN.
        new command.remote.Command(`${name}-egress-firewall`, {
            connection: { host, user: "ubuntu", privateKey: sshKey.privateKeyOpenssh, dialErrorLimit: 30 },
            create: "sudo bash -s",
            stdin: egressFirewallScript,
            triggers: [vm.id, egressFirewallScript],
        }, { parent: this, dependsOn: [install] });

        // Wings API (panel calls + browser console websocket) through Caddy on this host. The
        // dokploy-caddy-sync job only renders Dokploy domains, so non-Dokploy sites live in sites.d.
        const caddySitesImport = new command.local.Command(`${name}-caddy-sites-import`, {
            create: [
                "set -e",
                "mkdir -p /etc/caddy/sites.d",
                "grep -qxF 'import /etc/caddy/sites.d/*' /etc/caddy/Caddyfile || sed -i '\\#^import /etc/caddy/dokploy.d/\\*$#a import /etc/caddy/sites.d/*' /etc/caddy/Caddyfile",
                "grep -qxF 'import /etc/caddy/sites.d/*' /etc/caddy/Caddyfile",
                "caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null",
                "systemctl reload caddy",
            ].join("\n"),
        }, parent);
        const siteFile = `/etc/caddy/sites.d/${name}.caddy`;
        new command.local.Command(`${name}-caddy-site`, {
            create: [
                "set -e",
                `printf '# Managed by Pulumi (/root/hydrodactyl-infra/proxmox) - do not edit.\\n%s {\\n    reverse_proxy %s:8080\\n}\\n' "$PUBLIC_HOST" "$UPSTREAM" > ${siteFile}.new`,
                `mv ${siteFile}.new ${siteFile}`,
                `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null || { rm -f ${siteFile}; exit 1; }`,
                "systemctl reload caddy",
            ].join("\n"),
            delete: `rm -f ${siteFile} && systemctl reload caddy`,
            environment: { PUBLIC_HOST: args.publicHost, UPSTREAM: host },
        }, { parent: this, dependsOn: [caddySitesImport] });

        this.vmId = vm.vmId.apply(id => id ?? args.vmId);
        this.address = install.stdout.apply(() => host);
        this.sshPrivateKey = pulumi.secret(sshKey.privateKeyOpenssh);
        this.registerOutputs({ vmId: this.vmId, address: this.address });
    }
}
