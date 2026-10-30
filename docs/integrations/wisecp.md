# Proxmotion module for WISECP

A server module for **WISECP 5** (PHP 8.2 or newer). WISECP orders, suspends and
terminates VPS on Proxmotion, and customers manage their server with WISECP's own
server tools. The module is a thin client of the Proxmotion billing API v1
(`docs/api/openapi.yaml` in the Proxmotion repository); Proxmotion does the work.
Design: [ADR 0014](../../docs/adr/0014-wisecp-module.md).

> **Not run in a real WISECP yet.** It was written against WISECP 5.0-beta.3 and
> tested with WISECP and the Proxmotion API faked. Please report what does not work.

## What it does

| WISECP | Proxmotion |
|---|---|
| Create | Orders the server (package, location, OS, hostname, password, SSH key, resources, add-ons). Installation runs in Proxmotion; the service page shows the progress. Running Create again for a service that has a server changes nothing. |
| Suspend / Unsuspend | Stops / starts the server (the suspension reason is passed on) |
| Cancel (terminate) | Deletes the server and its disks; the addresses are released |
| Upgrade / downgrade | The new product's package and resources, with the same rules as ordering. CPU and memory take effect at the server's next restart unless *Restart after upgrades* is on. The disk only grows. |
| Change password | Sets the root password (12 to 128 characters) |
| Service page | Hostname, IP address, OS, location, status and resources, the month's traffic against the quota; tools: start, shut down, restart, force stop, reset root password, reinstall OS, VNC console, hostname change, reverse DNS, apps |

The root password: the customer's order answer or the service's password when it has
12 to 128 characters, otherwise Proxmotion generates one and the module stores it on the
service. After a reinstall, Proxmotion's new password appears on the service the next
time its page is opened.

## Installation

1. Copy the `coremio` folder of this directory into your WISECP root (it adds
   `coremio/modules/Servers/Proxmotion`).
2. In Proxmotion: *Admin â†’ Billing systems* â†’ add a billing system (e.g. "WISECP"),
   then **Create token** with all scopes. Optionally limit it to your WISECP server's
   IP address. Copy the token: it is shown once.
3. In WISECP: *Products â†’ Hosting & Servers â†’ Server Settings â†’ Add New Server*,
   tab **Virtualization**, module **Proxmotion**:
   - **Panel address:** your panel's hostname, e.g. `panel.example.com`, with the
     https switch on and port 443 (the panel must have a valid TLS certificate)
   - **Username (not used):** anything, e.g. `proxmotion` (WISECP requires the field)
   - **API token:** the token (`pmx_â€¦`), in WISECP's password field
   - **Test Connection** must succeed.
4. Use the server (or a server group with it) in your products.
5. Optionally, [receive webhooks](#webhooks).

## Products

On the product's **Module** tab, with module **Proxmotion**:

| Setting | Meaning |
|---|---|
| Package | The Proxmotion package (CPU, memory, disk, addresses, traffic, port speed), or **No package**: the resources come from the fields below |
| Location, OS template | Where the server is placed and what it runs, unless the customer chooses (order answers) |
| Network model | Bridged or routed; default: the first model the package allows (bridged without a package) |
| Restart after upgrades | Restart the server right away when an upgrade or downgrade changes CPU or memory |
| vCPU cores, Memory (GB), Disk (GB), IPv4/IPv6 addresses, Port speed (Mbps), Monthly traffic (GB) | Replace the package's value; empty: the package's. Without a package vCPU, memory and disk are required. |

The lists are loaded from Proxmotion through the product's server. Without a connection,
the ids can be typed in (`GET /api/v1/locations` and `GET /api/v1/os-templates` list them).

### Order answers

Product requirements (questions on the order form) can be mapped to the module:

| Module value | Answer |
|---|---|
| `os_template` | Selection whose option values are OS template ids from Proxmotion |
| `location` | Selection whose option values are location ids |
| `hostname` | Text: the server's hostname (otherwise the service's; without a valid one, a location with a hostname template in Proxmotion names the server, e.g. `ip-203-0-113-10.example.com`, and the service takes that name, otherwise `vps<service id>`) |
| `ssh_key` | Text area: an SSH public key installed for root |
| `root_password` | Password: 12 to 128 characters |
| `app` | Selection whose option values are app ids from Proxmotion (and `none`): installed once the server has booted (see *Apps at order time*) |
| `app_inputs` | Text area: the app's settings, one `key=value` per line (e.g. `port=1194`) |

### Add-ons

Add-on options can carry module values that are **added** to the package's (or the
product's) value: `extra_cpu_cores`, `extra_memory_gib`, `extra_disk_gib`,
`extra_ipv4_count`, `extra_ipv6_count`, `extra_port_speed_mbps`, `extra_traffic_gb`,
`extra_snapshots`, `extra_backups` (snapshot and backup slots, Proxmotion docs/adr/0051).
They need a package or the matching product field; otherwise the order fails with a
readable error. When an add-on changes, upgrade the service so Proxmotion gets the
new values.

### Apps at order time

The `app` order answer orders an app with the server (Proxmotion docs/adr/0016 Â§5). Its
ids are listed by `GET /api/v1/apps?mode=order` and in the Proxmotion admin panel. The
app is installed through the guest agent once the server has booted; a failed install
never fails the order and can be retried in the Apps tool. Proxmotion refuses the order
readably when the app does not fit the OS, resources or network model. WISECP's order
answers are fixed by the module, so the app's settings come from one answer,
`app_inputs`, one `key=value` per line; empty values use the app's defaults and keys of
other apps are left out. A paid app ordered this way is granted with the order.

### Paid apps

Apps marked paid in Proxmotion (Proxmotion docs/adr/0019) are installed later only when
the server has the right to them. Sell one as an **add-on** with the module value
`paid_app` set to the app id (several ids separated by spaces or commas). When the
service is created, and on every upgrade (the way add-on changes reach the module), the
module grants the server the paid apps of its add-ons and revokes the rights it granted
for add-ons that are gone (installed copies stay; rights from the order or from
Proxmotion administrators are left alone). Paid apps without the right are listed in the
Apps tool with a note to buy them as an add-on, and apps with a separately sold licence
(cPanel, Plesk) say so.

## Client area

WISECP shows its own server page. Tools are hidden while Proxmotion is installing,
reinstalling or terminating the server, and when it is not active.

The **VNC console** opens Proxmotion's console in a new tab through a link that is
valid for 60 seconds and works once; it opens only this server's console.

### Traffic

Proxmotion counts each server's traffic per month (ADR 0039 in the Proxmotion repository).
The service page shows the counted traffic of the current month against the server's quota
in WISECP's *Bandwidth* gauge and resource row, in decimal GB like the `extra_traffic_gb`
add-on (1 GB = 10â¹ bytes); without a quota the total is `unlimited`, and a panel from before
traffic accounting leaves both empty. The figures are read from `GET /servers/{id}` each
time the page opens. Not done: WISECP's metrics collection (`metrics_usage`), traffic
graphs, and a note on the page when Proxmotion suspended the server over its quota or a
usage limit (WISECP shows the suspension itself). Whether WISECP's templates show the
gauge and the `unlimited` total as expected is unverified.

### Apps

The **Apps** tool (the module's own page, `pages/tools/apps.php`: WISECP has no app
tool) shows the server's installed apps and the apps that fit it (Proxmotion's App
Marketplace: OpenVPN, WireGuard, Docker, â€¦), each with a small form for its settings.
Installing takes a few minutes inside the server; the page shows the progress and
reloads itself while an app installs, and a failed installation can be tried again.
One app installs at a time.

Outputs of installed apps (VPN client profiles, addresses) are fetched from Proxmotion
whenever the page is shown, and files when the customer downloads them; nothing is
stored in WISECP. The module log masks app settings and outputs, and the settings are
sent in a field WISECP masks in the service history. Outputs need a token with the
`apps:secrets` scope; without it, the apps are listed without outputs.

Installed apps also offer their **actions** (e.g. adding, revoking or listing VPN
clients), each with a small form, and **Uninstall** when the app has an uninstall
script (asked to confirm). The latest runs show with their status, error and outputs (a
new client's profile is downloaded from the run), fetched on demand like the install
outputs and masked in the module log. One action runs at a time per app; the page shows
its result once Proxmotion has read it (about a minute).

When Proxmotion has a newer version of an installed app that can upgrade it, the app
offers **Upgrade to `version`** (asked to confirm), with a field for each setting the
new version adds. The app keeps its data and settings; if the upgrade fails, it keeps
its current version and shows *Upgrade failed*, and it can be upgraded again or
uninstalled.

WISECP's own **Reinstall** tool has no place for an app, so the Apps tool also offers
**Reinstall with an app**: the OS, one of the apps that fit the server, that it may
install and that need no setting without a default (installed with its defaults), and a
confirmation. Proxmotion checks the app again against the chosen OS.

### Firewall

The module adds a **Firewall** tool of its own (`pages/tools/firewall.php`, Proxmotion
docs/adr/0035), shown while the server is active: the inbound rules in order, which always
apply, with up, down and delete, a button to allow or block everything else, a form to add a rule (allow or block, TCP, UDP, ICMP or any, a
port or range such as `1000-2000`, a source address or network, a comment), the rule sets
administrators prepared in Proxmotion (in place of the customer's rules or after them),
and the ports the server's apps open. Switched to blocking without a rule that allows
anything, it lets SSH (Linux) or RDP (Windows) in. Every change reads the current rules and
sends the whole list with an `Idempotency-Key`; Proxmotion's message is shown when a rule
is wrong. The field of a rule's action is `rule_action`, because WISECP removes `action`
from tool data. Like the Apps tool, it is unverified whether WISECP shows an added tool.

### SSH keys

An **SSH keys** tool of its own (`pages/tools/ssh-keys.php`, Proxmotion docs/adr/0049),
shown while the server is active, lists the keys Proxmotion manages for root (Administrator
on Windows) with delete, and has a form to add one or several public keys. Every change
reads the current keys and sends the whole list with an `Idempotency-Key`; Proxmotion's
message is shown when a key is wrong. The fields `public_key` and `fingerprint` are passed
on unfiltered, since keys hold `+`, `/` and `=`. Keys the customer added inside the server
are not listed and stay. Like the other added tools, it is unverified whether WISECP shows it.

### Snapshots

A **Snapshots** tool (`pages/tools/snapshots.php`, Proxmotion docs/adr/0051), shown while
the server is active, lists the snapshots of the server's disk and settings with *Roll back*
and *Delete* (each confirmed), and a form to take one with an optional label while slots
are free. How many a server may have comes from the package, plus the add-on value
`extra_snapshots`. Proxmotion refuses with its reason when a server is full or cannot have
snapshots. Unverified whether WISECP shows it.

### Backups

A **Backups** tool (`pages/tools/backups.php`, Proxmotion docs/adr/0051 Â§4), shown while the
server is active, lists the server's backups (full copies on separate storage made by
Proxmox) with label, time, size and operating system, *Restore* and *Delete* (each
confirmed), and a form to take one with an optional label while slots are free. How many a
server may have comes from the package, plus the add-on value `extra_backups`. A restore
replaces the whole disk and deletes the snapshots; the operating system and root password
become those of the backup. A backup the server can no longer reach shows Proxmotion's
reason instead of *Restore*. Proxmotion refuses with its reason when a server is full or
has no backup storage. Unverified whether WISECP shows it.

## Webhooks

Without webhooks, WISECP only learns what happens to a server when someone opens it.
With them, Proxmotion tells WISECP when a task finishes, also for operations an
administrator started in Proxmotion.

1. In Proxmotion: *Admin â†’ Billing systems* â†’ your billing system â†’ **Add webhook**:
   - **URL:** `https://your-wisecp-domain.com/api/v1/proxmotion/webhook`
   - **Events:** `server.provisioned`, `server.suspended`, `server.unsuspended`,
     `server.terminated`, `server.failed` (the others are only logged)
   - Copy the **signing secret** (`whsec_â€¦`): it is shown once.
2. In WISECP: the Proxmotion server â†’ **Webhook signing secret**: paste it. If several
   WISECP servers point to the same billing system, give each the same secret.
3. In Proxmotion, **Send test event**: the delivery log must show `200`, and WISECP's
   module log a `webhook ping` entry.

The receiver checks the signature, refuses requests signed more than 5 minutes ago
(keep the clocks in sync, e.g. with NTP) and ignores repeats of an event. It acts only
on services of the Proxmotion server whose secret signed the event (the service id is
the server's `external_id`):

| Event | In WISECP |
|---|---|
| `server.provisioned` | The service gets the server's hostname and addresses; a service still *waiting* or *in process* becomes *active* |
| `server.suspended` / `server.unsuspended` | The service becomes *suspended* / *active*, if the server still is (events can arrive late, so the module asks Proxmotion first) |
| `server.terminated` | The service is **not** changed: administrators get a notice and the service history says it is still billed. Cancel it in WISECP if it should not be. |
| `server.failed` | A notice to administrators (WISECP's *failed service activation* message, with the error) and a service history line |
| others | Logged only |

Every accepted event is written to the module log (the secret masked); refused requests
are logged without their body. Seen event ids are kept for a week in the table
`proxmotion_webhook_events`, created on the first event. When Proxmotion cannot be
reached to check a server's state, the receiver answers `503` and Proxmotion sends the
event again later.

## Troubleshooting

- WISECP's module log: every API call is logged. The token, root passwords and app
  settings and outputs are masked.
- No **Apps** tool on the service page: the server is not active, or the tool was
  disabled for the server or service in WISECP.
- "This token does not have the â€¦ scope": create a token with all scopes.
- "Unauthenticated.": the token is wrong, revoked or expired.
- "This token may not be used from your address.": add the WISECP server's address
  to the token in Proxmotion.
- Webhook deliveries fail with `401`: the server's signing secret is not the endpoint's
  current one. With `400` and "too old": the clocks differ. With `404`: WISECP did not
  route `/api/v1/proxmotion/webhook` to the module â€” please report it (ADR 0014).
- 404 for a server: each billing system only sees its own servers; the service must
  have been created through this billing system's token.



