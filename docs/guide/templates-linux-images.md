# Building OS templates (Linux, Windows, macOS)

Proxmotion clones new servers from cloud-init VM templates that contain `qemu-guest-agent`.
Building them takes two steps:

| Step | Where | Script | Needs |
|---|---|---|---|
| **1. Prepare the images** | Your own computer (Linux, Windows or macOS) | `deploy/proxmox/prepare-images.sh` | Internet, `virt-customize` (directly or in a container) |
| **2. Create the templates** | A root shell on the Proxmox VE node | `deploy/proxmox/build-templates.sh` | Nothing extra: only `pvesh` and `qm` |

Nothing is installed on the hypervisor, and the node never needs internet access.

To build a template from an installer ISO by hand instead (other distributions or a custom
installation), see [iso-templates.md](iso-templates.md); Windows Server templates have their own
guide, [windows-templates.md](windows-templates.md).

> **Status:** this procedure has not yet been tested end to end against a real Proxmox VE
> node, and the container path (Windows without WSL, macOS) has not been tested at all.
> Please report problems.

**Contents**

1. [Prepare the images](#1-prepare-the-images): [Linux](#linux) · [Windows](#windows) · [macOS](#macos) · [Any OS with Docker](#any-os-with-docker)
2. [Copy the images to the node](#2-copy-the-images-to-the-node)
3. [Create the templates on the node](#3-create-the-templates-on-the-node)
4. [Use them in the panel](#4-use-them-in-the-panel)
5. [Refreshing templates](#5-refreshing-templates)
6. [Troubleshooting](#6-troubleshooting)

## What the scripts do

`prepare-images.sh` downloads the official cloud images (Ubuntu 24.04 and 22.04, Debian 13 and
12), checks them against the checksums the distributions publish, installs `qemu-guest-agent`
into each image with `virt-customize`, and writes `tpl-<key>.qcow2` files plus a `SHA256SUMS`
file to `./proxmotion-images/`.

`build-templates.sh` turns each `tpl-<key>.qcow2` into a Proxmox template named
`tpl-<key>-<YYYYMMDD>` with a cloud-init drive and the guest agent enabled.

The available keys are listed in `TEMPLATES` at the top of `prepare-images.sh`
(`ubuntu-24.04`, `ubuntu-22.04`, `debian-13`, `debian-12`). Use `ONLY="…"` with either script to
handle only some of them.

Plan for about **1 GB of disk space per template** on your computer (downloads plus prepared
images).

---

## 1. Prepare the images

Get the scripts first: clone the repository, or download `deploy/proxmox/prepare-images.sh`,
`deploy/proxmox/build-templates.sh` and (for the container path) `deploy/proxmox/images.Dockerfile`.

Pick the section for your computer. On every path the result is the same folder:

```
proxmotion-images/
├── tpl-ubuntu-24.04.qcow2   ← copy these to the node
├── tpl-debian-12.qcow2
├── SHA256SUMS               ← and this
└── downloads/               ← cached original images, not needed on the node
```

### Linux

Works on any x86-64 Linux distribution; this is the fastest path.

1. Install the tools:

   | Distribution | Command |
   |---|---|
   | Debian / Ubuntu | `sudo apt install curl libguestfs-tools` |
   | Fedora / RHEL / Rocky / Alma | `sudo dnf install curl guestfs-tools` |
   | Arch | `sudo pacman -S curl guestfs-tools` |
   | openSUSE | `sudo zypper install curl guestfs-tools` |

2. **Ubuntu only:** Ubuntu makes the kernel files in `/boot` readable only by root, which
   `virt-customize` needs. Either run the script with `sudo`, or allow reading them:

   ```bash
   sudo chmod +r /boot/vmlinuz-*
   ```

3. For speed, make sure you can use KVM (`ls -l /dev/kvm`; add yourself to the `kvm` group if
   needed: `sudo usermod -aG kvm "$USER"`, then log in again). Without KVM it still works, only
   slower.

4. Run the script:

   ```bash
   cd deploy/proxmox
   ./prepare-images.sh
   # or only some templates:
   ONLY="ubuntu-24.04 debian-12" ./prepare-images.sh
   ```

If `virt-customize` fails, run `libguestfs-test-tool`; it prints what is missing.

### Windows

Use **WSL 2** (recommended). Without WSL, use [Docker Desktop](#any-os-with-docker).

1. Install WSL with Ubuntu, in PowerShell **as administrator**, then restart:

   ```powershell
   wsl --install -d Ubuntu
   ```

2. Open the **Ubuntu** app and install the tools:

   ```bash
   sudo apt update
   sudo apt install curl libguestfs-tools linux-image-generic
   sudo chmod +r /boot/vmlinuz-*
   ```

   `linux-image-generic` gives `virt-customize` a kernel for its helper VM; WSL does not
   ship one in `/boot`.

3. Work inside the Linux file system (`~`), not under `/mnt/c/…`: it is much faster and avoids
   Windows line endings. Copy the scripts in and run them:

   ```bash
   mkdir -p ~/proxmotion && cd ~/proxmotion
   cp /mnt/c/path/to/proxmotion/deploy/proxmox/*.sh .
   sed -i 's/\r$//' *.sh        # only needed if an editor added Windows line endings
   chmod +x *.sh
   export LIBGUESTFS_BACKEND=direct
   ./prepare-images.sh
   ```

4. The images are now in `~/proxmotion/proxmotion-images/`. Windows Explorer can open them
   at `\\wsl$\Ubuntu\home\<user>\proxmotion\proxmotion-images`.

WSL may not offer `/dev/kvm`; the script then works without it, a few minutes per image.

### macOS

`virt-customize` does not run natively on macOS, so it runs in a Linux container. Install one
of these container runtimes: [Docker Desktop](https://www.docker.com/products/docker-desktop/),
[OrbStack](https://orbstack.dev/) or [Colima](https://github.com/abiosoft/colima)
(`brew install colima docker && colima start`). Then follow [Any OS with Docker](#any-os-with-docker).

- **Intel Macs:** works like on Linux without KVM.
- **Apple Silicon (M1 and later):** the images are x86-64, so the container runs with
  `--platform linux/amd64` under emulation, and `virt-customize` inside it emulates a whole
  x86-64 VM. Expect it to be **very slow** (possibly tens of minutes per image). If that is
  too slow, use any x86-64 Linux machine instead — for example a temporary Linux VM on one of
  your Proxmox nodes that has internet access, or a small cloud VM — and follow the
  [Linux](#linux) section there.

### Any OS with Docker

The container image contains everything `prepare-images.sh` needs. In a terminal, inside
`deploy/proxmox/`:

1. Build the container image (once):

   ```bash
   docker build --platform linux/amd64 -t proxmotion-images -f images.Dockerfile .
   ```

2. Run it. The prepared images land in `proxmotion-images/` next to the scripts.

   macOS / Linux:

   ```bash
   docker run --rm --platform linux/amd64 -v "$PWD/proxmotion-images:/out" proxmotion-images
   ```

   Windows (PowerShell):

   ```powershell
   docker run --rm --platform linux/amd64 -v "${PWD}\proxmotion-images:/out" proxmotion-images
   ```

   Only some templates: add `-e ONLY="ubuntu-24.04 debian-12"` before `proxmotion-images`.
   On a Linux host with KVM, add `--device /dev/kvm` for speed.

---

## 2. Copy the images to the node

Copy `tpl-*.qcow2` and `SHA256SUMS` to `/root/proxmotion-templates/` on the node, and
`build-templates.sh` to `/root/`. Replace `NODE` with the node's address.

**Linux, macOS, WSL** (and Windows PowerShell, which includes `ssh`/`scp` since Windows 10):

```bash
ssh root@NODE mkdir -p /root/proxmotion-templates
scp proxmotion-images/tpl-*.qcow2 proxmotion-images/SHA256SUMS root@NODE:/root/proxmotion-templates/
scp build-templates.sh root@NODE:/root/
```

If PowerShell reports that `tpl-*.qcow2` does not exist, list the files by name instead of
using `*`, or use WinSCP.

**Windows with a GUI:** [WinSCP](https://winscp.net/) (protocol SFTP, user `root`). Create
`/root/proxmotion-templates` and drag the files into it.

**Without SSH access — Proxmox web UI:** recent Proxmox VE releases (8.3 and later, as far as we
know; not yet verified with Proxmotion) have an **Import** content type for storages:

1. *Datacenter → Storage → `local` → Edit*: add **Import** to the content types.
2. *Node → `local` → Import → Upload*: upload the `tpl-*.qcow2` files and `SHA256SUMS`.
3. The files end up in `/var/lib/vz/import/`; use `WORKDIR=/var/lib/vz/import` in step 3.
4. For `build-templates.sh`, open *Node → Shell*, run `nano /root/build-templates.sh`, paste
   the script and save.

---

## 3. Create the templates on the node

In a root shell on the node (SSH, or *Node → Shell* in the web UI):

```bash
cd /root
sed -i 's/\r$//' build-templates.sh   # harmless; fixes Windows line endings if any
chmod +x build-templates.sh
STORAGE=local-lvm POOL=proxmotion ./build-templates.sh
```

| Setting | Default | Meaning |
|---|---|---|
| `STORAGE` | `local-lvm` | Storage for the template disk and cloud-init drive |
| `BRIDGE` | `vmbr0` | Bridge for `net0` (the panel sets the real network per server) |
| `POOL` | none | Resource pool of the panel's API token. **Set it** if the token is limited to a pool, or the panel will not see the templates |
| `FIRST_VMID` | `9000` | Lowest VMID to use; the first free one from here upwards is taken, checked across the whole cluster |
| `ONLY` | all prepared images | Space-separated keys; a missing image is then an error |
| `WORKDIR` | `/root/proxmotion-templates` | Where the images are |
| `REFRESH` | `0` | `1` = build a new dated template even if one exists (see step 5) |

What to expect:

- Each image becomes a template named `tpl-<key>-<YYYYMMDD>`, e.g. `tpl-ubuntu-24.04-20261016`.
- Templates are looked up **by name on this node**, so the script is safe to re-run: a key
  that already has a template is skipped. If a VM that is *not* a template has such a name, the
  script stops instead of guessing.
- The checksum is verified when `SHA256SUMS` was copied along.
- The images are kept; delete them yourself once the templates exist.

**Clusters:** with **local** storage (LVM-thin, ZFS, directory), repeat steps 2 and 3 on every
node that should host servers. With **shared** storage (Ceph, NFS, iSCSI), one node is enough.

---

## 4. Use them in the panel

1. *Admin → Clusters*: run a sync so the panel sees the new templates.
2. *Admin → OS templates*: map each Proxmox template to an OS template.

---

## 5. Refreshing templates

Cloud images receive security updates, so rebuild the templates now and then (for example
monthly):

1. Run `prepare-images.sh` again (step 1). It downloads only images that have changed
   upstream and prepares all selected images again.
2. Copy the new images to the node (step 2).
3. On the node: `REFRESH=1 ./build-templates.sh` (optionally with `ONLY=…`). This builds a new
   dated template next to the old one; the old one is not touched.
4. In the panel, sync the cluster and map the OS template to the new Proxmox template.
5. Delete the old template in Proxmox once nothing uses it. Full clones do not depend on it;
   while **linked clones** (OS template *Clone method*, [ADR 0027](../adr/0027-linked-clones.md))
   use its base disk, Proxmox refuses to delete it, so keep it until those servers are
   reinstalled or terminated.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `virt-customize: error: … supermin … kernel` | Install a kernel (`linux-image-generic` on Ubuntu/WSL) and make it readable: `sudo chmod +r /boot/vmlinuz-*` |
| `virt-customize` hangs or is extremely slow | No KVM: expected on WSL/macOS, just wait. On Linux, check `/dev/kvm` and the `kvm` group. Run `libguestfs-test-tool` for details |
| `Checksum mismatch` in `prepare-images.sh` | The distribution is publishing a new image right now; try again later |
| `Checksum mismatch` in `build-templates.sh` | The copy is incomplete; copy the image again |
| `$'\r': command not found` | Windows line endings: `sed -i 's/\r$//' build-templates.sh` |
| `qm/pvesh not found` | You are not on a Proxmox VE node shell |
| `A VM that is not a template uses the name …` | Rename or remove that VM, then run again |
| The panel does not list the template | Set `POOL` to the panel's resource pool (or add the template to the pool in Proxmox), then sync |
| Servers boot but the panel cannot reach the guest agent | The template was not built from a prepared image; rebuild it with these scripts |
| `Command guest-exec has been disabled` (AlmaLinux, Rocky, RHEL, CentOS, Fedora) | Their `qemu-guest-agent` blocks `guest-exec` and file access by default. In the template (and on servers already cloned from it): `sed -i -e 's/^FILTER_RPC_ARGS=.*/FILTER_RPC_ARGS=""/' -e 's/^BLACKLIST_RPC=.*/BLACKLIST_RPC=/' /etc/sysconfig/qemu-ga && systemctl restart qemu-guest-agent` (see [iso-templates.md](iso-templates.md#4-prepare-the-system-for-cloning)) |
| The *wait_agent* step says `cloud-init finished with status error` (or `degraded done`) or `was still running after 10 minutes` | A new server becomes active only once `cloud-init status` reports it has finished, so the guest scripts (hostname, addresses) run after cloud-init. Check `cloud-init status --long` and `/var/log/cloud-init.log` inside the server; a template that needs the network to reach a mirror waits for it |
| The *wait_agent* step says `cloud-init had not started after 10 minutes` | cloud-init stayed `not started` (`not run` before 24.1): it is not enabled in the template, or does not find the CloudInit drive (`cloud-init status --long`, `/run/cloud-init/`) |
| `mkdir failed … Permission denied` or `failed to open file '/var/lib/proxmotion/…'` (AlmaLinux, Rocky, RHEL) | SELinux confines the commands the guest agent runs. In the template and on servers already cloned from it: `dnf install -y policycoreutils-python-utils && semanage permissive -a virt_qemu_ga_t` (only the agent's domain becomes permissive). `ausearch -m avc -ts recent` shows what was denied |

## Why not reuse Virtualizor templates?

Virtualizor's KVM templates are plain disk images and could technically be imported with
`qm importdisk`. We do not recommend it:

- Proxmotion configures the network, root password and SSH keys through **cloud-init**.
  Virtualizor templates are configured by Virtualizor's own mechanism and are not guaranteed
  to contain cloud-init, so servers may boot without network or credentials.
- The App Marketplace and status checks need **qemu-guest-agent**, which may be missing.
- The images are distributed by Virtualizor's vendor; their licence for use outside
  Virtualizor is unclear.

Existing Virtualizor servers do not need templates: they are adopted as they are
(see the migration plan in `AGENTS.md`). Reinstalling them uses Proxmotion's templates.
