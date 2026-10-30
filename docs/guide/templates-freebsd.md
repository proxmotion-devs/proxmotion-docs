# FreeBSD templates

*Türkçe: [tr/freebsd-templates.md](tr/freebsd-templates.md)*

This guide turns a FreeBSD 14 or 15 installation (amd64, UFS root file system) into a Proxmox VM
template that Proxmotion can clone. It follows the structure of the Linux guide,
[iso-templates.md](iso-templates.md), and explains only what differs on FreeBSD; read the Linux
guide's first two sections for why each condition exists.

The panel treats a FreeBSD template like a Linux one: the user is `root`, scripts are `sh`
scripts, the root password and SSH keys come from cloud-init. When the template's operating system
has the slug `freebsd`, the panel runs its FreeBSD versions of the default guest scripts
(`resources/guest/freebsd`: additional addresses, disk growth, hostname) instead of the Linux ones,
and its checks from inside use only commands FreeBSD has too ([ADR 0048](../adr/0048-freebsd-templates.md)).

> **Status:** this follows the documented behaviour and the source of FreeBSD, cloud-init, the
> QEMU guest agent and Proxmox VE. It has not been tried on a real Proxmox VE yet. Please report
> problems.

**Contents**

1. [How a FreeBSD server is born from a template](#how-a-freebsd-server-is-born-from-a-template)
2. [What does not work on FreeBSD](#what-does-not-work-on-freebsd)
3. [Step 1: the VM in Proxmox](#step-1-the-vm-in-proxmox)
4. [Step 2: install with UFS, root last](#step-2-install-with-ufs-root-last)
5. [Step 3: updates, cloud-init and the guest agent](#step-3-updates-cloud-init-and-the-guest-agent)
6. [Step 4: hand the network to cloud-init](#step-4-hand-the-network-to-cloud-init)
7. [Step 5: the QEMU guest agent](#step-5-the-qemu-guest-agent)
8. [Step 6: root login](#step-6-root-login)
9. [Step 7: forget the identity, shrink, shut down](#step-7-forget-the-identity-shrink-shut-down)
10. [Step 8: turn the VM into a template](#step-8-turn-the-vm-into-a-template)
11. [Step 9: add it to the panel and test it](#step-9-add-it-to-the-panel-and-test-it)
12. [Updating a template](#updating-a-template)
13. [Troubleshooting](#troubleshooting)

## How a FreeBSD server is born from a template

The panel does exactly what it does for Linux (clone, settings, disk grown, firewall, start, wait
for the agent and cloud-init, guest scripts, checks from inside). Inside the VM, FreeBSD's tools do
the work:

- Proxmox writes the CloudInit drive in the **NoCloud** format for every OS type except Windows,
  so a VM of OS type *Other* gets the same CD as a Linux one. cloud-init from the FreeBSD packages
  (`net/cloud-init`) reads it.
- cloud-init grows the root partition and file system by running FreeBSD's own **growfs** service
  (`/etc/rc.d/growfs`: `gpart recover`, `gpart resize`, `growfs`), writes the network and the
  hostname into `/etc/rc.conf` and `/etc/resolv.conf`, and sets root's password (`pw`) and SSH
  keys. Its FreeBSD network renderer may rename the interface (`ifconfig_vtnet0_name`) to the name
  in Proxmox's network configuration; the panel's scripts find the interface by its MAC address.
- The panel waits until `cloud-init status` says cloud-init has finished, as on Linux. For that the
  agent must find `cloud-init` in `/usr/local/bin` (step 3).
- A password reset uses the agent's `guest-set-user-password`, which runs `pw usermod` on FreeBSD.

## What does not work on FreeBSD

| Feature | Why | What to do |
|---|---|---|
| Apps | The app runner (`run.sh`) needs bash and `systemd-run` | Never tick a FreeBSD version for an app (*Apps → Choose systems*) |
| *Disk space* card on the server page | Older FreeBSD guest agents do not implement `guest-get-fsinfo` (QEMU added it for FreeBSD in 2026) | Nothing; with such an agent the card says the agent did not answer |
| *Stop script* in the task list (ADR 0043 §7) | Finding a run's processes needs Linux's `/proc/*/environ` | The task still ends; the script runs on inside the server until it exits |
| A primary IPv6 address other than cloud-init's | FreeBSD picks the source address of outgoing IPv6 connections by RFC 6724, not by the default route | Nothing for IPv4 (the default route's `-ifa` sets it); for IPv6 the old address may stay the source while it is still on the interface |

Everything else (creating, reinstalling, power, console, passwords, SSH keys, additional addresses,
primary address changes, hostname changes, disk upgrades, moves, firewall, traffic, checks from
inside) works as on Linux.

## Step 1: the VM in Proxmox

Download `FreeBSD-<version>-RELEASE-amd64-disc1.iso` from `download.freebsd.org` with *Download
from URL*, with the SHA256 checksum from the `CHECKSUM.SHA256-FreeBSD-<version>-RELEASE-amd64` file
next to it. Then *Create VM* with a VMID outside the range of your servers:

| Setting | Value | Why |
|---|---|---|
| OS type | *Other* | NoCloud CloudInit drive, like Linux |
| QEMU Agent | ticked | the channel of the guest agent |
| Disk | 10 GiB, SCSI, *VirtIO SCSI single*, Discard, SSD emulation | small template, grown per package; FreeBSD names it `da0` |
| CPU | the default type (`x86-64-v2-AES`), not *host* | clones must start on every node |
| Network | VirtIO (`vtnet0`) | |
| Resource pool | the panel's pool, if its token is limited to one | the token clones only what it sees |

After creating it: *Hardware → Add → VirtIO RNG*. Every clone starts with the entropy file
(`/boot/entropy`, `/entropy`) the template saved when it last shut down; the VirtIO RNG
(`virtio_random`, step 3) mixes fresh randomness from the host in at every boot, so clones do not
start their random number generator from the same state.

## Step 2: install with UFS, root last

The rule of the Linux guide holds: the root file system is the **last** partition with no swap
after it, because the panel adds free space at the end of the disk and growfs only grows the last
partition. FreeBSD's guided UFS layout puts swap **after** root, so delete it:

1. Boot the ISO, *Install*, a keymap, any hostname.
2. *Distribution Select*: untick every optional component (the base system is always installed).
3. *Partitioning*: *Auto (UFS)*, *Entire Disk*, *GPT*. In the partition editor select the
   `freebsd-swap` partition, *Delete*, then *Finish* and *Commit*. The free space left behind is
   used by the first clone that grows.
4. A temporary root password. *Network*: configure `vtnet0` for the build (removed in step 4).
   *Time zone*: UTC.
5. *System Configuration*: `sshd` on, `dumpdev` off (crash dumps need a swap device). *Hardening*:
   the defaults. *Add users*: No. Exit and reboot.

Check after the first boot:

```sh
gpart show da0      # freebsd-ufs is the last partition, only free space after it
swapinfo            # lists no swap device
```

ZFS works with growfs as well (`zpool online -e`), but needs more memory per server and the guided
ZFS layout keeps a swap partition in front of the pool, so this guide uses UFS.

## Step 3: updates, cloud-init and the guest agent

Log in on the console as root. Install the updates first and restart once: after cloud-init is
enabled, the template should not boot again, because a boot without a CloudInit drive runs
cloud-init with no data source, and it creates its default user `freebsd` (step 7 removes it if
that happened anyway).

```sh
PAGER=cat freebsd-update fetch install
pkg bootstrap -y && pkg upgrade -y
reboot
```

FreeBSD 15 installed from base system packages (pkgbase) is updated with `pkg upgrade` alone.

Then install cloud-init and the agent and set them up:

```sh
pkg install -y net/cloud-init qemu-guest-agent
sysrc cloudinit_enable=YES qemu_guest_agent_enable=YES
sysrc qemu_guest_agent_env="PATH=/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin"
sysrc growfs_swap_size=0
sysrc -f /boot/loader.conf virtio_console_load=YES virtio_random_load=YES
```

| Setting | Why |
|---|---|
| `cloudinit_enable` | the one switch of cloud-init's rc.d scripts (`dsidentify`, `cloudinitlocal`, `cloudinit`, `cloudconfig`, `cloudfinal`) |
| `qemu_guest_agent_env` | `/etc/rc` and `service` start daemons with `PATH=/sbin:/bin:/usr/sbin:/usr/bin`. Commands the panel runs through the agent inherit it, so without `/usr/local/bin` the cloud-init check finds no `cloud-init` and the panel stops waiting at once (rc.subr passes `${name}_env` to `env(1)`) |
| `growfs_swap_size=0` | growfs, which cloud-init runs on the first boot, otherwise adds a swap partition at the end of disks over 15 GB when `/etc/fstab` lists no swap. Root would then not be last any more and could never grow again. The panel's FreeBSD disk script sets it too |
| `virtio_console_load` | the VirtIO serial driver the agent talks through (`/dev/vtcon/org.qemu.guest_agent.0`); it is not in the GENERIC kernel |
| `virtio_random_load` | the VirtIO RNG of step 1 |

Tell cloud-init where to look. On FreeBSD its configuration is under `/usr/local/etc/cloud/`:

```sh
cat > /usr/local/etc/cloud/cloud.cfg.d/99-proxmotion.cfg <<'EOF'
datasource_list: [NoCloud, None]
disable_root: false
ssh_pwauth: true
EOF
```

With a single data source (plus `None`) in the list, `ds-identify` uses it without having to
recognise the CD itself. `disable_root` and `ssh_pwauth` belong to step 6. FreeBSD's cloud-init
already keeps root enabled; the line documents it.

## Step 4: hand the network to cloud-init

As on Linux, the installer's settings would fight with the ones cloud-init writes on each clone.
On FreeBSD they are lines in `/etc/rc.conf` and the file `/etc/resolv.conf`. cloud-init's FreeBSD
renderer writes its own `ifconfig_*` lines and `defaultrouter` but never removes others, and it
adds its name servers to an existing `resolv.conf`, so the build network's would stay. Remove the
`rc.conf` lines now (the network keeps working until the next boot); step 7 removes `resolv.conf`.

```sh
sysrc -ix ifconfig_vtnet0 ifconfig_vtnet0_ipv6 defaultrouter ipv6_defaultrouter rtsold_enable
grep -E '^(ifconfig_|defaultrouter|ipv6_defaultrouter|rtsold)' /etc/rc.conf    # prints nothing
```

## Step 5: the QEMU guest agent

Load the VirtIO console driver and start the agent without a restart (from the next boot
`loader.conf` loads the driver):

```sh
kldload virtio_console
service qemu-guest-agent start
ls /dev/vtcon/                    # org.qemu.guest_agent.0
```

FreeBSD's agent restricts nothing by default: `guest-exec` and the file commands work. Check from
the node shell while the VM runs; every command must answer with `exitcode 0`, and the third must
print `/usr/local/bin/cloud-init` (otherwise `qemu_guest_agent_env` is missing: set it and restart
the service):

```bash
qm guest cmd <vmid> ping
qm guest exec <vmid> -- id
qm guest exec <vmid> -- sh -c 'command -v cloud-init'
qm guest exec <vmid> -- mkdir -p /var/lib/proxmotion/check
qm guest exec <vmid> -- rmdir /var/lib/proxmotion/check /var/lib/proxmotion
```

## Step 6: root login

FreeBSD's sshd refuses root by default (`PermitRootLogin no`). sshd keeps the first value it reads,
and FreeBSD's `sshd_config` has these settings only as comments, so append them:

```sh
printf 'PermitRootLogin yes\nPasswordAuthentication yes\n' >> /etc/ssh/sshd_config
sshd -T | grep -E '^(permitrootlogin|passwordauthentication) '
sysrc sshd_enable=YES
```

`ssh_pwauth: true` (step 3) lets cloud-init allow passwords as well. For key-only logins use
`PermitRootLogin prohibit-password`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`
(FreeBSD also asks for passwords through PAM's keyboard-interactive method) and `ssh_pwauth: false`;
customers then need an SSH key.

## Step 7: forget the identity, shrink, shut down

```sh
pw usershow freebsd > /dev/null 2>&1 && pw userdel -n freebsd -r
pw usermod root -w no             # cloud-init sets the real password
cloud-init clean --logs --seed
rm -f /etc/hostid /etc/machine-id /etc/ssh/ssh_host_*
rm -f /etc/resolv.conf /var/db/dhclient.leases.*
rm -rf /tmp/* /var/tmp/*
find /var/log -type f -exec truncate -s 0 {} +
pkg clean -ay
rm -f /root/.sh_history /root/.history
poweroff
```

| What | Why |
|---|---|
| user `freebsd` | cloud-init's default user on FreeBSD, created if the template ever booted with cloud-init enabled |
| root's password | it would work on every server until cloud-init sets the real one |
| cloud-init state | otherwise cloud-init takes the clone for the same instance and skips its work |
| `/etc/hostid`, `/etc/machine-id` | the host's identity; `/etc/rc.d/hostid` creates both again at boot, from the SMBIOS UUID Proxmox gives each clone |
| SSH host keys | sshd's rc.d script and cloud-init create new ones |
| `resolv.conf`, DHCP leases | the build network's (step 4) |
| logs, temporary files, the package cache, shell history | they only make every clone larger |

Do not start the VM again afterwards: its first boot would give it an identity again. If you must,
repeat this step.

## Step 8: turn the VM into a template

As on Linux: remove the CD/DVD drive, *Hardware → Add → CloudInit Drive* on the disk's storage
(leave the *Cloud-Init* tab empty), *Options → Boot Order* only `scsi0`, *QEMU Guest Agent*
enabled, *More → Convert to template*. With local storage the template must exist on every node
that hosts servers.

## Step 9: add it to the panel and test it

1. Add the template to the panel's resource pool, if its token is limited to one, and sync the
   cluster (*Admin → Clusters*).
2. *Admin → OS templates*: with `freebsd` in the Proxmox template's name, *Found on Proxmox*
   suggests the system *FreeBSD* and the version. The operating system FreeBSD has the platform
   *Linux* and the slug `freebsd`; the slug makes the panel use its FreeBSD scripts (*Scripts* on
   the template's row shows them as defaults). If you add the system by hand under *Operating
   systems*, name it *FreeBSD* so its slug is `freebsd`.
3. Leave the new version unticked for every app.
4. Create **two** test servers and check:

| Check | Expected |
|---|---|
| The task finishes without notes, the server page shows the guest agent | cloud-init and the agent work; the checks from inside pass |
| `ssh root@<address>` with the password and with a key | root login |
| `ifconfig`, `netstat -rn`, `hostname`, `cat /etc/resolv.conf` | the panel's address, gateway, name and DNS |
| `df -h /` | the package's disk size |
| `cat /etc/hostid` and `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on both servers | different on each |
| *Edit IP addresses* adds an address, a reboot keeps it | the FreeBSD address script and its `proxmotion_addresses` rc.d script |
| *Change resources* with a larger disk | `df -h /` grows without a reboot (the FreeBSD disk script) |
| *Change hostname*, then a reboot | the new name in `hostname` and `/etc/hosts` (the FreeBSD hostname script and its `proxmotion_hostname` rc.d script) |

## Updating a template

1. *Clone* the template (mode **Full clone**). In the clone's *Cloud-Init* tab set *User* `root`
   and a temporary *Password*, start it and log in on the console.
2. `PAGER=cat freebsd-update fetch install` (or only `pkg upgrade` on pkgbase), `pkg upgrade -y`,
   restart. Check that steps 3–6 still hold, repeat step 7 and clear the *Cloud-Init* user and
   password.
3. Convert it to a template with a new dated name, sync the cluster and map the OS template to it.

Moving to a new release (14 → 15) is better done as a new template from the new ISO.

## Troubleshooting

| What you see | Probable cause |
|---|---|
| The server needs 10 minutes to become active, *the guest agent did not answer* | `virtio_console_load` missing in `/boot/loader.conf`, the agent not enabled, or *QEMU Guest Agent* off in the template's options (steps 3 and 5) |
| The server becomes active at once, but the hostname or `/etc/hosts` is wrong right after creation | The agent does not find `cloud-init`, so the panel did not wait for it: `qemu_guest_agent_env` (step 3) |
| *cloud-init had not started after 10 minutes* | `cloudinit_enable` missing, or a `cloud-init.disabled` file in `/usr/local/etc/cloud/` |
| The server has the template's address or none | `ifconfig_vtnet0` or `defaultrouter` left in `/etc/rc.conf` (step 4); `/var/log/cloud-init.log` |
| `df -h /` shows the template's size | Root is not the last partition (step 2), or growfs added a swap partition after root because `growfs_swap_size=0` was missing: `gpart show da0` |
| *Disk grown* notes `/etc/rc.d/growfs is missing` or a growfs error | The run's output is in the log under *Scripts* on the OS template |
| *Additional IP addresses* notes *No network interface with MAC address* | The VM's `net0` MAC differs from the interface's; `ifconfig` |
| The root password is refused over SSH but works on the console | `PermitRootLogin` (step 6): `sshd -T` |
| A user `freebsd` exists on servers | The template booted with cloud-init enabled and step 7 was skipped |
