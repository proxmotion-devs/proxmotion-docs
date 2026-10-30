# Linux templates from an installer ISO

*Türkçe: [tr/iso-templates.md](tr/iso-templates.md)*

This guide explains how to turn almost any Linux distribution into a Proxmox VM template that
Proxmotion can clone. It does not hand you one script per distribution. Instead it explains what
a template has to provide, why, how to get there on the common distribution families, and how to
check each point yourself, so you can build a template for a distribution this guide never
mentions.

For Ubuntu and Debian, the cloud-image path in [os-templates.md](os-templates.md) is faster.
Windows has its own guide: [windows-templates.md](windows-templates.md), and so has FreeBSD: [freebsd-templates.md](freebsd-templates.md).

> **Status:** this follows the documented behaviour of Proxmox VE, cloud-init and the installers.
> So far only a Debian 13 template has been used with a real Proxmox VE; the notes on the other
> distributions have not been tried. Please report problems.

**Contents**

1. [How a server is born from a template](#how-a-server-is-born-from-a-template)
2. [The six conditions](#the-six-conditions)
3. [Distribution families at a glance](#distribution-families-at-a-glance)
4. [Step 1: the VM in Proxmox](#step-1-the-vm-in-proxmox)
5. [Step 2: install with the right disk layout](#step-2-install-with-the-right-disk-layout)
6. [Step 3: cloud-init](#step-3-cloud-init)
7. [Step 4: hand the network to cloud-init](#step-4-hand-the-network-to-cloud-init)
8. [Step 5: the QEMU guest agent](#step-5-the-qemu-guest-agent)
9. [Step 6: root login](#step-6-root-login)
10. [Step 7: forget the identity, shrink, shut down](#step-7-forget-the-identity-shrink-shut-down)
11. [Step 8: turn the VM into a template](#step-8-turn-the-vm-into-a-template)
12. [Step 9: add it to the panel and test it](#step-9-add-it-to-the-panel-and-test-it)
13. [Distributions without systemd](#distributions-without-systemd)
14. [Updating a template](#updating-a-template)
15. [Troubleshooting](#troubleshooting)

## How a server is born from a template

Knowing what happens to a template explains every rule that follows. When the panel creates a
server, it:

1. **Clones** the template: a full copy of its disk, or a linked clone that shares it
   ([ADR 0027](../adr/0027-linked-clones.md)).
2. **Writes the VM settings**: cores, memory, the network card with the server's MAC address, and
   the cloud-init fields: `ciuser=root`, the root password, SSH keys, the IP addresses
   (`ipconfig0`), DNS servers and the VM name (the hostname).
3. **Grows the disk** to the package size. Only the virtual disk grows; the partitions and file
   system inside it are still the template's size.
4. **Sets up the Proxmox firewall** of the VM (anti-spoofing, isolation, the server's rules).
5. **Starts** the VM. Proxmox turns the cloud-init fields into a small CD (the *CloudInit drive*,
   label `cidata`, NoCloud format for Linux).
6. Inside the VM, **cloud-init** reads that CD on the first boot: it grows the root partition and
   file system to fill the disk, writes the network configuration, sets the hostname, the root
   password and the SSH keys, and creates new SSH host keys.
7. The panel **waits for the QEMU guest agent** and then until `cloud-init status` no longer says
   that cloud-init has not started or is running (`not started` / `running`; before cloud-init
   24.1, as on EL8 and Debian 12, `not run` / `degraded running`). Then it runs its guest scripts through the agent (additional addresses, a different
   primary address) and checks the server from inside (addresses, gateway, DNS, hostname, disk).

So the template is an installed system that has been made to **forget who it is** and that
**lets cloud-init and the guest agent tell it** who it is now. Everything below follows from that.

You can see exactly what a VM will receive on its CD, at any time, on the node:

```bash
qm cloudinit dump <vmid> user      # password, SSH keys, hostname
qm cloudinit dump <vmid> network   # addresses, gateway, DNS
```

## The six conditions

| # | Condition | Why | Check |
|---|---|---|---|
| 1 | **The root file system is the last partition** on the disk, with no swap partition after it. Avoid LVM | cloud-init can only grow the last partition into the space the panel adds | `lsblk` |
| 2 | **cloud-init** is installed, enabled, reads the Proxmox CD, and its network part is not disabled | It applies everything the panel sets | `cloud-init status --long` |
| 3 | **No installer network configuration** is left over | It would fight with the configuration cloud-init writes | the network files of your distribution |
| 4 | **qemu-guest-agent** runs and may execute commands and write files, and *QEMU Guest Agent* is on in the VM's options | The panel waits for it, resets passwords and runs scripts and apps through it | `qm guest exec <vmid> -- id` on the node |
| 5 | **root can log in** over SSH with a password and with keys | Customers receive root's password and keys | `sshd -T` |
| 6 | **No identity**: no machine ID, no SSH host keys, no cloud-init state, no installer password | Every clone must be a new machine | `cat /etc/machine-id` is empty |

Plus the virtual hardware: a CloudInit drive, only the disk in the boot order, no ISO.

## Distribution families at a glance

Distributions inherit their tooling from a few families. Find yours here; the steps below refer to
these columns. Package names change now and then, so when one is not found, search your
distribution's package index for the program (`growpart`, `cloud-init`, `qemu-ga`).

| | Debian, Ubuntu (and Mint, Pardus…) | RHEL family: AlmaLinux, Rocky, Oracle, CentOS Stream, RHEL, Fedora | SUSE: openSUSE Leap/Tumbleweed, SLES | Arch (and Manjaro…) |
|---|---|---|---|---|
| Packages | `apt` | `dnf` | `zypper` | `pacman` |
| cloud-init | `cloud-init` | `cloud-init` | `cloud-init` | `cloud-init` |
| `growpart` (cloud-init needs it to grow the partition) | `cloud-guest-utils` | `cloud-utils-growpart` | `growpart` | `cloud-guest-utils` |
| Guest agent | `qemu-guest-agent` | `qemu-guest-agent` | `qemu-guest-agent` | `qemu-guest-agent` |
| Network stack the installer leaves | Ubuntu: netplan (`/etc/netplan/`). Debian: ifupdown (`/etc/network/interfaces`) | NetworkManager (`/etc/NetworkManager/system-connections/`, older: `/etc/sysconfig/network-scripts/`) | Leap 15: wicked (`/etc/sysconfig/network/ifcfg-*`). Leap 16, Tumbleweed: NetworkManager | whatever you set up: systemd-networkd (`/etc/systemd/network/`) or NetworkManager |
| Agent restrictions | none | `/etc/sysconfig/qemu-ga` blocks commands; SELinux confines the agent | SELinux on Leap 16 (check `getenforce`) | none |
| Root SSH by default | Debian: keys only. Ubuntu: no root password at all | RHEL 9+: keys only unless ticked in the installer | keys only on recent releases | keys only |
| Default layout of the installer | Ubuntu: LVM. Debian: swap partition | LVM with swap | Btrfs plus a swap partition | your choice |

## Step 1: the VM in Proxmox

Upload the ISO under *Node → storage with the ISO image content type → ISO Images* (*Download from
URL* with the vendor's checksum saves a trip through your computer), then *Create VM*. Each setting
has a reason:

| Setting | Value | Why |
|---|---|---|
| VMID, name | outside your servers' range (e.g. 9000+), `tpl-<distro>-<version>-<date>` | The panel allocates VMIDs from its own range; a date tells templates apart |
| Resource pool | the panel's pool, if its API token is limited to one | The token can only clone what it can see |
| OS type | Linux | Proxmox then writes the cloud-init CD in NoCloud format, which every Linux cloud-init reads |
| BIOS | SeaBIOS (default) or OVMF (UEFI); OVMF needs an EFI disk | Either works; clones inherit it. UEFI is required by some newer distributions |
| SCSI controller, disk bus | VirtIO SCSI single, SCSI | Fast, and supports *Discard* |
| Disk size | small, e.g. 10 GiB | Every used block is copied for every full clone; the panel grows the disk anyway |
| Discard, SSD emulation | on | `fstrim` can then hand freed blocks back to the storage, making the template smaller |
| QEMU Agent | on | Without it the VM has no channel for the agent (condition 4) |
| CPU type | the default (`x86-64-v2-AES`), not `host` | `host` ties the template to one CPU model and clones may not start on other nodes |
| Memory | enough for the installer (2 GiB) | The panel sets each server's own value |
| Network | VirtIO, a bridge with internet access | The installer and updates need it; this configuration is removed in step 4 |

## Step 2: install with the right disk layout

**The rule:** whatever the boot loader needs (a 1 MiB *BIOS boot* partition on GPT with SeaBIOS, an
*EFI system partition* with UEFI, a separate `/boot` if you insist) comes first; the root file
system comes **last**, with nothing after it.

**Why:** the panel grows the virtual disk, which adds free space at its end. cloud-init's `growpart`
can only extend the partition that touches that free space, then grows the file system on it
(ext4, XFS and Btrfs can all grow while mounted). A swap partition after root blocks this; LVM puts
a volume between partition and file system, and whether cloud-init extends that volume on the first
boot depends on its version. The panel's own resize script handles LVM on later upgrades, but a
plain partition needs nothing to go right.

**Swap:** none, or a swap *file* inside root (Ubuntu creates one itself). The panel decides memory;
customers can add swap.

How to get there with each installer:

- **Ubuntu Server:** *Use an entire disk*, and **untick** *Set up this disk as an LVM group*. Create
  a temporary user (e.g. `setup`), tick *Install OpenSSH server*, no snaps.
- **Debian:** *Manual* partitioning, one primary ext4 partition mounted at `/`, no swap (confirm
  the warning). Set a root password; create the required user as `setup`. Software: *SSH server* and
  *standard system utilities* only.
- **RHEL family (Anaconda):** *Installation Destination → Custom → Standard Partition*. Let it add
  `biosboot` or `/boot/efi` if it asks, then one `/` with all remaining space; delete swap.
  *Minimal Install*. Set a root password and tick *Allow root SSH login with password*.
- **openSUSE / SLES:** *Guided Setup*: no LVM, no separate home, no separate swap partition (Btrfs
  root with snapshots is fine). In the summary, make sure the SSH service is enabled **and the SSH
  port is open**.
- **Arch and do-it-yourself installers:** the same rule by hand; `archinstall` works with
  ext4 or XFS, no separate partitions besides the boot loader's.

**Check** after the first boot: `lsblk` shows root as the last partition of `sda` and no swap
partition.

```
NAME   SIZE TYPE MOUNTPOINT
sda     10G disk
├─sda1   1M part
└─sda2  10G part /
```

If the VM boots into the installer again, set the CD/DVD drive to *Do not use any media* under
*Hardware*.

## Step 3: cloud-init

Log in on the console as root (Ubuntu: as `setup`, then `sudo -i`). Bring the system up to date and
install `cloud-init`, `growpart` and the guest agent with the package names from the
[table](#distribution-families-at-a-glance), for example on the RHEL family:

```bash
dnf upgrade -y
dnf install -y cloud-init cloud-utils-growpart qemu-guest-agent
```

**Make sure it runs at boot.** cloud-init runs as a few systemd units (`cloud-init-local`,
`cloud-init` or, from version 24.3, `cloud-init-network`, `cloud-config`, `cloud-final`). Most
packages enable them; some (SUSE, Arch) do not. List them and enable any that are disabled:

```bash
systemctl list-unit-files 'cloud-*'
```

**Tell it where to look.** By default cloud-init probes many clouds, some over the network, which
only times out on Proxmox. Configuration files in `/etc/cloud/cloud.cfg.d/` are read in name order
and **later files win**, so put the panel's settings in a late file:

```yaml
# /etc/cloud/cloud.cfg.d/99-proxmotion.cfg
datasource_list: [NoCloud, ConfigDrive, None]
disable_root: false
ssh_pwauth: true
```

`NoCloud` is what Proxmox writes for Linux, `ConfigDrive` what it writes when the VM's
cloud-init type is changed to it, `None` lets cloud-init finish without data. `disable_root` and
`ssh_pwauth` belong to [step 6](#step-6-root-login).

**Remove what disables it.** Installers that use cloud-init themselves leave files that switch it
off or pin it to "no data source". Look for them; whatever you find besides your own file is a
candidate for removal:

```bash
ls /etc/cloud/cloud.cfg.d/ /etc/cloud/cloud-init.disabled 2>/dev/null
grep -rl -e 'config: disabled' -e 'datasource_list' /etc/cloud/
```

On Ubuntu these are `subiquity-disable-cloudinit-networking.cfg`, `99-installer.cfg`,
`90-installer-network.cfg` and, if present, `/etc/cloud/cloud-init.disabled`.

**Check:** `cloud-init status --long` must not say `disabled`. (On the template it says `done` or
`not started`; after step 7 it is `not started`, which is what a clone should see. cloud-init before
24.1 says `not run` instead of `not started`.)

## Step 4: hand the network to cloud-init

**Why:** the installer wrote a configuration for the network it saw (DHCP or your temporary
address). On a clone, cloud-init writes its own for the server's real address. If the installer's
file stays, two configurations claim the same interface: the clone may come up with the template's
address, wait for a DHCP server that does not exist, or lose its address at the next restart.

**How:** remove the installer's files, but not the network stack itself. cloud-init picks the
first stack it finds installed (netplan, ifupdown, NetworkManager, networkd, sysconfig) and writes
its own file for it, marked as generated by cloud-init. Use the row *Network stack* of the
[table](#distribution-families-at-a-glance):

- Ubuntu: delete the files in `/etc/netplan/`.
- Debian: reduce `/etc/network/interfaces` to the loopback and the `source` line:

  ```
  auto lo
  iface lo inet loopback

  source /etc/network/interfaces.d/*
  ```

- NetworkManager distributions: delete the profiles in `/etc/NetworkManager/system-connections/`
  (and old `ifcfg-eth0`-style files in `/etc/sysconfig/network-scripts/`).
- wicked (openSUSE Leap 15): delete `/etc/sysconfig/network/ifcfg-eth0` (keep `ifcfg-lo`).
- systemd-networkd: delete your `.network` files in `/etc/systemd/network/`.

The VM keeps working until it reboots; you do not need the network again before step 7.

**Check on a test server** (step 9): `grep -i 'selected renderer' /var/log/cloud-init.log` names
the stack cloud-init used, and only cloud-init's file configures the interface.

## Step 5: the QEMU guest agent

**Why:** the agent is the panel's only way into the server: it tells the panel the server has
booted, sets passwords, writes files and runs the panel's scripts and apps. The panel never logs
in over SSH.

**How:** the package is installed in step 3. On many distributions the agent service has no
`[Install]` section and is started by udev when its VirtIO serial port appears, which exists only
when *QEMU Guest Agent* is on in the VM's *Options*. So: make sure the option is on (shut the VM
down and start it again after changing it), then `systemctl start qemu-guest-agent`, or
`systemctl enable --now qemu-guest-agent` where it can be enabled.

**Restrictions.** Some distributions limit what the agent may do:

- **RHEL family:** `/etc/sysconfig/qemu-ga` blocks `guest-exec` and file access by default. Clear
  the filter so the panel can run commands:

  ```bash
  sed -i -e 's/^FILTER_RPC_ARGS=.*/FILTER_RPC_ARGS=""/' -e 's/^BLACKLIST_RPC=.*/BLACKLIST_RPC=/' /etc/sysconfig/qemu-ga
  ```

- **SELinux enforcing** (RHEL family; openSUSE Leap 16): commands the agent runs stay in its
  confined domain and cannot, for example, create directories under `/var/lib` or run installers.
  Make only that domain permissive; the rest of SELinux stays enforcing:

  ```bash
  dnf install -y policycoreutils-python-utils     # provides semanage
  semanage permissive -a virt_qemu_ga_t
  ```

**Check from the node** while the VM runs. These are the kinds of calls the panel makes; each must
answer, and `exec` prints the command's `exitcode`, which must be `0`:

```bash
qm guest cmd <vmid> ping
qm guest exec <vmid> -- id
qm guest exec <vmid> -- mkdir -p /var/lib/proxmotion/check
qm guest exec <vmid> -- rmdir /var/lib/proxmotion/check /var/lib/proxmotion
```

`ping` without an answer: the service is not running or the VM option is off. `exec` refused: the
RHEL filter. `mkdir` with *Permission denied*: SELinux.

## Step 6: root login

**Why:** Proxmox passes `ciuser=root`, so cloud-init puts the customer's password and SSH keys on
root. That is useless when SSH refuses root or passwords.

**Two places decide it:**

1. **cloud-init:** `disable_root: false` (otherwise it fills root's `authorized_keys` with a
   "log in as another user" message) and `ssh_pwauth: true` (otherwise it switches password logins
   off). Both are in the file of [step 3](#step-3-cloud-init).
2. **sshd:** `PermitRootLogin yes` and `PasswordAuthentication yes`. Note that sshd keeps the
   **first** value it reads for a setting, and most distributions read
   `/etc/ssh/sshd_config.d/*.conf` in name order at the top of `sshd_config`. Files written by
   cloud-init (`50-cloud-init.conf`) or by cloud images (`60-cloudimg-settings.conf`) would win
   over a file named `99-…`. Use a low number:

   ```bash
   printf 'PermitRootLogin yes\nPasswordAuthentication yes\n' > /etc/ssh/sshd_config.d/10-proxmotion.conf
   ```

   If `sshd_config` has no `Include /etc/ssh/sshd_config.d/*.conf` line (RHEL 8 and older), set both
   options in `sshd_config` itself instead.

**Check** what sshd will really do:

```bash
sshd -T | grep -E '^(permitrootlogin|passwordauthentication) '
```

**A firewall inside the template** (firewalld, ufw) must allow SSH, or be off. The panel filters
traffic with the Proxmox firewall outside the VM.

Key-only logins are a valid choice: `PermitRootLogin prohibit-password`, `PasswordAuthentication
no` and `ssh_pwauth: false`. Customers then need an SSH key, and the password the panel shows only
works on the console.

## Step 7: forget the identity, shrink, shut down

Everything that makes this VM *this* machine must go, so each clone creates its own. Each line
below has a reason; adapt the paths to your distribution.

| What | Why | How |
|---|---|---|
| Temporary user | It would exist, with a known password, on every server | `userdel -r setup` (log in as root first; on Ubuntu give root a temporary password with `passwd root`) |
| root's password | The installer's password would work until cloud-init replaces it | `passwd -l root` (cloud-init sets the real one) |
| cloud-init state | Otherwise cloud-init thinks the clone is the same instance and skips its work | `cloud-init clean --logs --seed` |
| Machine ID | systemd, DHCP and journald identify the machine by it; clones would collide | `truncate -s 0 /etc/machine-id` (empty, not deleted: systemd fills an empty file at boot). On Debian-style systems also point `/var/lib/dbus/machine-id` at it |
| SSH host keys | Every server would share them, and customers would see host key warnings after a reinstall | `rm -f /etc/ssh/ssh_host_*` (cloud-init or `sshd-keygen` creates new ones) |
| Random seed, DHCP leases | Shared randomness, stale leases | `rm -f /var/lib/systemd/random-seed /var/lib/dhcp/* /var/lib/NetworkManager/*.lease` |
| Logs, temp files, caches, history | Size, and nothing of the build should reach customers | `apt clean` / `dnf clean all` / `zypper clean -a`, `rm -rf /tmp/* /var/tmp/*`, `journalctl --rotate && journalctl --vacuum-time=1s`, `history -c` |
| Free blocks | A full clone copies only blocks the storage thinks are used | `fstrim -av` (needs *Discard* on the disk) |

Then `poweroff`. **Do not start the VM again** after this: its first boot would give it an identity
again. If you have to, repeat this step before converting it.

## Step 8: turn the VM into a template

With the VM stopped:

1. *Hardware → CD/DVD Drive*: **remove** it (a clone would otherwise carry the ISO).
2. *Hardware → Add → CloudInit Drive*, on the same storage as the disk. Leave the *Cloud-Init* tab
   empty: the panel fills it in for every server.
3. *Options*: *Boot Order* only the disk (`scsi0`); *QEMU Guest Agent* on.
4. Optional: *Hardware → Add → Serial Port* (`serial0`) for a serial console.
5. *More → Convert to template*.

On a cluster with **local** storage, the template must exist on every node that hosts servers
(*Clone → Target node*, mode *Full clone*, then convert the clone). With **shared** storage one is
enough. A **linked clone** also needs the template on the storage the server's disk goes to.

## Step 9: add it to the panel and test it

1. If the panel's API token is limited to a resource pool, add the template to that pool
   (*Datacenter → Permissions → Pools → `<pool>` → Members → Add → Virtual Machine*).
2. *Admin → Clusters*: sync the cluster.
3. *Admin → OS templates*: the template appears under *Found on Proxmox* with a suggested system and
   version; add the system under *Operating systems* first if it is missing. Then tick the new
   version for the apps that should be offered on it (*Admin → Apps → Choose systems*); no app is
   offered on a version until then (ADR 0026). An inactive template can already be chosen on the
   admin create form for a test server.
4. Create **two** test servers and check the six conditions on them:

| Check | Expected |
|---|---|
| The task finishes without notes, the server page shows the guest agent | conditions 2 and 4 |
| `ssh root@<address>` with the password and with a key | condition 5 |
| `ip addr`, `ip route`, `hostname`, `cat /etc/resolv.conf` | the panel's address, gateway, name and DNS; condition 3 |
| `df -h /` | the package's disk size; condition 1 |
| `cat /etc/machine-id` and `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on both servers | different on each; condition 6 |
| *Edit IP addresses* adds an address, a reboot keeps it | the panel's guest scripts work |
| *Change resources* with a larger disk | `df -h /` grows without a reboot |

## Distributions without systemd

Alpine, Void, Gentoo with OpenRC and similar can be templates when they have cloud-init and the
guest agent (Alpine: `apk add cloud-init qemu-guest-agent`, then `setup-cloud-init` and
`rc-update add qemu-guest-agent`): creating servers, passwords and SSH keys work. The panel's
default guest scripts, however, keep additional addresses and a changed hostname across reboots
with systemd units; without systemd those are applied but lost at the next restart. Write your own
versions for the template under *OS templates → Scripts* (ADR 0010), or offer such templates only
with packages that have a single address.

FreeBSD has its own guide, [freebsd-templates.md](freebsd-templates.md): the panel runs FreeBSD versions of its scripts on such templates (ADR 0048). Other BSDs and non-Linux systems are not supported: the panel's default scripts are Linux shell scripts.

## Updating a template

Refresh templates now and then for security updates:

1. *Clone* the template (mode **Full clone**). In the clone's *Cloud-Init* tab set *User* `root`
   and a temporary *Password*, start it and log in on the console.
2. Install the updates. Check that nothing of steps 3–6 was undone (an update may bring back a
   configuration file), then repeat step 7 and clear the *Cloud-Init* user and password.
3. Do step 8 with a new dated name, sync the cluster and map the OS template to the new template.
4. Delete the old template once nothing uses it. Full clones do not depend on it. While **linked
   clones** use its base disk, Proxmox refuses to delete it: keep it until those servers are
   reinstalled or terminated, and plan the storage for old templates.

## Troubleshooting

| What you see | Probable cause |
|---|---|
| The server needs 10 minutes to become active, *the guest agent did not answer* | The agent is not installed or not running, or *QEMU Guest Agent* is off in the template's options (step 5) |
| *guest-exec … disabled* or similar in a task note | The RHEL agent filter (step 5) |
| Apps or scripts fail with *Permission denied* on a RHEL-family server | SELinux confines the agent (step 5) |
| The server has the template's address or none | Installer network files left over, or cloud-init's network disabled (steps 3 and 4). `/var/log/cloud-init.log` says which |
| `df -h /` shows the template's size | Root is not the last partition, `growpart` is missing, or the root is on LVM (step 2). `grep -i growpart /var/log/cloud-init.log` |
| The root password is refused over SSH but works on the console | sshd refuses root or passwords; an earlier file in `sshd_config.d` wins (step 6). `sshd -T` |
| Two servers have the same machine ID or host keys | Step 7 was skipped, or the template VM was started after it |
| Hostname is `localhost` or the template's name | cloud-init did not run (`cloud-init status --long`) |
