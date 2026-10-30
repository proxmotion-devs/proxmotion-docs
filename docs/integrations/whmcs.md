# Proxmotion module for WHMCS

A server module for **WHMCS 8 and 9** (PHP 7.2 or newer). WHMCS orders, suspends
and terminates VPS on Proxmotion, and customers manage their server in the WHMCS
client area. The module is a thin client of the Proxmotion billing API v1
(`docs/api/openapi.yaml` in the Proxmotion repository); Proxmotion does the work.

## What it does

| WHMCS | Proxmotion |
|---|---|
| Create | Orders the server (package, location, OS, hostname, password, SSH key, configurable options). The hostname is the service's domain; without a valid one, a location with a hostname template in Proxmotion names the server (e.g. `ip-203-0-113-10.example.com`) and the service's domain follows, otherwise it is `vps<service id>`. Installation runs in Proxmotion; the client area shows the progress. Running Create again for a service that has a server changes nothing. |
| Suspend / Unsuspend | Stops / starts the server (the WHMCS suspension reason is passed on) |
| Terminate | Deletes the server and its disks; the addresses are released |
| Change Password | Sets the service password as the root password (at least 12 characters) |
| Change Package | Upgrades and downgrades: the new product's package and configurable options, with the same rules as ordering. CPU and memory take effect at the server's next restart (the client area says so) unless *Restart after upgrades* is on. The disk only grows. Additional IP addresses come from Proxmotion's pools; with fewer, the newest extra ones are released. |
| Client area | Status, power state, IP addresses with reverse DNS, hostname change (the service domain follows), start / shut down / reboot / force stop, browser console, root password reset, reinstall, the month's traffic against the quota and why Proxmotion suspended the server, usage charts (see [Usage history](#usage-history)) |
| Admin area | Server status (and why Proxmotion suspended it), addresses and the month's traffic on the service page, a link to the server in Proxmotion, power and password buttons |
| Usage update | WHMCS's daily cron writes each service's traffic of the month and its quota into its usage statistics (see [Traffic](#traffic)) |

The service password: when it has at least 12 characters, it becomes the root
password. Otherwise Proxmotion generates one and the module stores it on the
service. A password reset in the client area stores the new password there as well.

## Installation

1. Copy the `proxmotion` folder (this folder) to `modules/servers/` of your WHMCS.
2. In Proxmotion: *Admin â†’ Billing systems* â†’ add a billing system (e.g. "WHMCS"),
   then **Create token** with all scopes. Optionally limit it to your WHMCS server's
   IP address. Copy the token: it is shown once.
3. In WHMCS: *System Settings â†’ Servers â†’ Add New Server*:
   - **Module:** Proxmotion
   - **Hostname:** your panel's hostname, e.g. `panel.example.com`
   - **Password:** the API token (`pmx_â€¦`)
   - **Secure:** checked (the panel must have a valid TLS certificate)
   - **Test Connection** must succeed.
4. Put the server into a server group and use that group in your products.
5. Optionally, [receive webhooks](#webhooks).

## Products

*System Settings â†’ Products/Services â†’ (product) â†’ Module Settings*, module **Proxmotion**:

| Setting | Meaning |
|---|---|
| Package | The Proxmotion package (CPU, memory, disk, addresses, traffic, port speed), or **No package**: the resources come from configurable options only (see below) |
| Location | Where the server is placed, unless the `location` configurable option is chosen |
| OS template | The operating system, unless the `os_template` configurable option is chosen |
| Network model | Bridged or routed; default: the first model the package allows (bridged without a package) |
| Restart after upgrades | Restart the server right away when an upgrade or downgrade changes CPU or memory |
| Paid app addons | Product addons that sell a paid app, one `<addon id>=<app id>` per line (see *Paid apps* below) |

The lists are loaded from Proxmotion with the product's server.

### Configurable options

Configurable options are matched by their **option name** (the part before `|`, e.g.
`memory_gib|Memory (GB)`). Options with other names are ignored.

| Option name | Type | Value |
|---|---|---|
| `os_template` | Dropdown | Sub-option names `<OS template id>\|<name shown>`, e.g. `0199â€¦\|Ubuntu 24.04` |
| `location` | Dropdown | Sub-option names `<location id>\|<name shown>` |
| `network_model` | Dropdown | `bridged\|Bridged`, `routed\|Routed` |
| `app` | Dropdown | An app installed once the server has booted: sub-option names `<app id>\|<name shown>`, e.g. `wireguard\|WireGuard`, and `none\|No app` (see *Apps at order time*) |
| `cpu_cores` | Quantity / dropdown | Number of vCPUs (replaces the package's value) |
| `memory_mib`, `memory_gib` | Quantity / dropdown | Memory (replaces the package's value) |
| `disk_mib`, `disk_gib` | Quantity / dropdown | Disk size |
| `ipv4_count`, `ipv6_count` | Quantity / dropdown | Number of addresses |
| `port_speed_mbps` | Quantity / dropdown | Port speed |
| `traffic_gb` | Quantity / dropdown | Monthly traffic in GB (10â¹ bytes) |
| `snapshots`, `backups` | Quantity / dropdown | How many snapshots and backups the server may have (0: none; Proxmotion docs/adr/0051) |
| `extra_<any of the above>` | Quantity / dropdown | **Added** to the package's value, e.g. `extra_memory_gib` with 2 adds 2 GB, `extra_ipv4_count` adds addresses |

The ids of OS templates and locations are listed by `GET /api/v1/os-templates` and
`GET /api/v1/locations`, and shown in the Proxmotion admin panel.

Resources stay within the limits of the Proxmotion admin form; a server needs at least
one address. The same options apply to upgrades and downgrades (*Upgrade/Downgrade
Options* in WHMCS): WHMCS then runs Change Package with the new values.

**Products without a package** (Package: *No package*) get all resources from
configurable options: `cpu_cores`, `memory_mib`/`memory_gib` and `disk_mib`/`disk_gib`
are required (the order fails with a readable error otherwise); addresses default to
one IPv4 address (`ipv4_count`, `ipv6_count` to change it); port speed and traffic are
unlimited unless given. `extra_*` options need a package and are refused here. The IP
addresses always come from Proxmotion's IP pools of the location.

### SSH key

Add a product custom field named `ssh_key|SSH public key` (text area, show on order
form). Its value is installed for root.

### Apps at order time

The `app` configurable option orders an app with the server (Proxmotion docs/adr/0016
Â§5). Its ids are listed by `GET /api/v1/apps?mode=order` (with `os_template` for the
apps that fit an OS) and in the Proxmotion admin panel. The app is installed through the
guest agent once the server has booted; a failed install never fails the order and can be
retried from the client area. Proxmotion refuses the order with a readable error when the
app does not fit the OS template, resources or network model.

App settings come from product custom fields named `app_<input key>` (e.g. `app_port|VPN
port`, show on order form). Empty fields use the app's defaults, and fields of other apps
are left out, so one product can offer several apps. A paid app ordered this way is
granted with the order.

## Client area

The module replaces the product details overview. Texts are in the customer's
language when the module has it (`lang/english.php`, `lang/turkish.php`); other
languages fall back to English. Add a language by copying `lang/english.php`
to `lang/`language_name`.php` and translating it.

The **console** opens in a new tab through a link that is valid for 60 seconds and
works once; it opens only this server's console.

### Traffic

Proxmotion counts each server's traffic per month (from the *traffic reset day* of its
*Panel settings*, incoming and outgoing together unless set otherwise; see ADR 0039 in the
Proxmotion repository). The overview shows the month's traffic against the quota with a
bar, what the server received and sent, and the day the count starts again. Units are
decimal like the `traffic_gb` option: 1 GB is 10â¹ bytes.

When Proxmotion suspended the server itself, the overview says why: over its traffic
quota it is unsuspended automatically when the next month starts or when the quota is
raised; over a usage limit (CPU, memory, disk or network) the customer is asked to contact
support. A suspension by WHMCS is not explained again. Suspending such a service in WHMCS
makes the suspension WHMCS's, so Proxmotion no longer lifts it.

### Usage history

The overview of an active or suspended server charts its CPU and network use and its
traffic over the last 24 hours, 7 days, 30 days or 12 months (`GET /servers/{id}/usage`,
ADR 0050). The range is a link (`pmxrange` in the address); the charts are SVG drawn by
the module, with each value shown on hover, and need no JavaScript. With a Proxmotion
before usage history the section is left out.

**Usage update:** `proxmotion_UsageUpdate` runs with WHMCS's daily cron when its usage
statistics update is enabled in the automation settings, once per WHMCS server of this module. It reads every server of the billing system from
`GET /servers` (all pages) and writes the counted traffic of the month to `bwusage` and the
quota to `bwlimit` (MB, 1 MB = 10â¶ bytes; 0 = no limit) of the service whose id is the
server's `external_id` and that belongs to that WHMCS server. Terminated servers, services of
other WHMCS servers and disk usage are left alone. WHMCS can then show bandwidth usage and bill
overages from these values. Not run in a real WHMCS yet.

### Apps

Active servers show their installed apps and the apps that fit the server
(Proxmotion's App Marketplace: OpenVPN, WireGuard, Docker, â€¦), each with a small form
for its settings. Installing takes a few minutes inside the server; the customer
reloads the page to see the progress, and can try a failed installation again. One app
installs at a time.

Outputs of installed apps (VPN client profiles, addresses) are fetched from Proxmotion
whenever the page is shown and files are downloaded through the module; nothing is
stored in WHMCS, and the module log masks them. They need a token with the
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

The **reinstall** form can bring an app with the new system: it lists the apps that fit
the server, that it may install and that need no setting without a default (they are
installed with their defaults). Proxmotion checks the app again against the chosen OS.

### Firewall

Active servers show their **firewall** (Proxmotion docs/adr/0035): its inbound rules in
order, which always apply, whether everything else is allowed or blocked, and the ports
its apps open. The customer switches between allowing and blocking everything else
(blocking asks to confirm), adds a rule (allow or block, TCP, UDP, ICMP or any, a port or range
such as `1000-2000`, a source address or network, a comment), moves rules up and down,
deletes them, and applies a **rule set** the administrators prepared in Proxmotion (in
place of their rules or after them). Switched to blocking without a rule that allows
anything, it lets SSH (Linux) or RDP (Windows) in. Every change reads the current rules from
Proxmotion first and sends the whole list back with an `Idempotency-Key`; Proxmotion
checks the rules and the module shows its message when one is wrong. Nothing is stored in
WHMCS. Changes take a few seconds to reach the server; the console works even when the
firewall locks the customer out.

### Snapshots

Active servers whose package (or `snapshots` option) allows snapshots list them in a
**Snapshots** section (Proxmotion docs/adr/0051): label and time, *Roll back* and *Delete*,
each with a confirmation, and a form to take one with an optional label while slots are
free (custom action `Snapshots` with `op` take, rollback or delete). A rollback takes the
disk back to that moment and Proxmotion puts its own settings back; the root password then
is the one of that time, so the customer resets it. Proxmotion's message is shown when a
server is full or cannot have snapshots. Hidden with a Proxmotion without snapshots, or when it answers with an error (the rest of the page still shows).

### Backups

Active servers whose package (or `backups` option) allows backups list them in a
**Backups** section (Proxmotion docs/adr/0051 Â§4): label, time, size and operating system,
*Restore* and *Delete*, each with a confirmation, and a form to take one with an optional
label while slots are free (custom action `Backups` with `op` take, restore or delete).
Backups are full copies on separate storage made by Proxmox; they survive reinstalls, and a
backup of a large server can take a long time, during which the server takes no other
action. A restore replaces the whole disk and deletes the snapshots; the operating system
and root password become those of the backup, so the customer resets the password. A backup
the server can no longer reach (after Proxmotion's administrators moved it) shows the reason
instead of *Restore*. Proxmotion's message is shown when a server is full or has no backup
storage. Hidden with a Proxmotion without backups, or when it answers with an error.

### SSH keys

Active servers list the **SSH keys** Proxmotion manages for root (Administrator on Windows)
(Proxmotion docs/adr/0049): the keys of the order or the last reinstall and those added
since, by comment, type and fingerprint. The customer pastes a public key (or several, one
per line) to add it and deletes keys (with a confirmation); a deleted key is removed from
the server. Every change reads the current keys from Proxmotion first and sends the whole
list back with an `Idempotency-Key` (custom action `SshKeys`); Proxmotion checks the keys
and the module shows its message when one is wrong. Keys the customer added inside the
server are not listed and stay. Nothing is stored in WHMCS. The section is hidden with a
Proxmotion that does not manage keys yet.

A **reinstall** keeps the server's keys; a key typed into the reinstall form is added to
them (the module reads the current keys and sends them with it). With a Proxmotion that
does not manage keys yet, the typed key is the new system's only key, as before.

### Paid apps

Apps marked paid in Proxmotion (Proxmotion docs/adr/0019) are installed later only when
the server has the right to them. Sell one as a **product addon** and map it in the module
setting *Paid app addons*, one `<addon id>=<app id>` per line (e.g. `12=cpanel`). When
WHMCS activates the addon (`AddonActivation` hook in `hooks.php`), the module grants the
app to the service's server; when the addon is cancelled or terminated (`AddonCancelled`,
`AddonTerminated`), the right is revoked: new installs stop, an installed copy stays.
Each grant and revoke is written to the activity log, also when it fails. Paid apps
without the right show a **Buy** button that opens the service's addons in the cart, and
apps with a separately sold licence (cPanel, Plesk) say so. Ordering a server with a paid
app through the `app` option grants it as well.

## Webhooks

Without webhooks, WHMCS only learns what happens to a server when it asks
(the client area, the admin service page). With them, Proxmotion tells WHMCS when
a task finishes, also for operations an administrator started in Proxmotion.

1. In Proxmotion: *Admin â†’ Billing systems* â†’ your billing system â†’ **Add webhook**:
   - **URL:** `https://`https://your-whmcs-domain.com`/modules/servers/proxmotion/webhook.php`
     (your WHMCS system URL followed by `modules/servers/proxmotion/webhook.php`)
   - **Events:** `server.provisioned`, `server.suspended`, `server.unsuspended`,
     `server.terminated`, `server.failed` (the others are only logged)
   - Copy the **signing secret** (`whsec_â€¦`): it is shown once.
2. In WHMCS: *System Settings â†’ Servers* â†’ the Proxmotion server â†’ **Access Hash**:
   paste the signing secret. Keep the API token in the **Password** field. If several
   WHMCS servers point to the same billing system, give each the same secret.
3. In Proxmotion, **Send test event**: the delivery log must show `200`, and
   *Utilities â†’ Logs â†’ Module Log* in WHMCS a `webhook ping` entry.

The receiver checks the signature, refuses requests signed more than 5 minutes
ago (keep the clocks of both servers in sync, e.g. with NTP) and ignores repeats of
an event. It acts only on services of the Proxmotion server whose secret signed the
event (the service id is the server's `external_id`):

| Event | In WHMCS |
|---|---|
| `server.provisioned` | A *Pending* service becomes *Active*; the domain follows the server's hostname |
| `server.suspended` / `server.unsuspended` | The service becomes *Suspended* / *Active*, if the server still is (events can arrive late, so the module asks Proxmotion first). A suspension WHMCS itself started changes nothing more. |
| `server.terminated` | The service is **not** changed: an email to administrators and an activity log entry say that it is still billed. Terminate or cancel it in WHMCS if it should not be. |
| `server.failed` | An email to administrators (WHMCS *account* notifications) and an activity log entry with the error |
| others | Logged only |

Every event is written to the module log (the secret masked). Status changes and
notifications also appear in the activity log. Seen event ids are kept for a week in
the table `mod_proxmotion_webhook_events`, which the receiver creates on its first
event. When Proxmotion cannot be reached to check a server's state, the receiver
answers `503` and Proxmotion sends the event again later.

## Troubleshooting

- *Utilities â†’ Logs â†’ Module Log*: every API call is logged. The token and root
  passwords are masked.
- "This token does not have the â€¦ scope": create a token with all scopes.
- "Unauthenticated.": the token is wrong, revoked or expired.
- "This token may not be used from your address.": add the WHMCS server's address
  to the token in Proxmotion.
- Webhook deliveries fail with `401`: the access hash of the WHMCS server is not the
  endpoint's current signing secret (it changes when it is replaced in Proxmotion).
  With `400` and "too old": the clocks of WHMCS and Proxmotion differ.
- 404 for a server: each billing system only sees its own servers; the service
  must have been created through this billing system's token (or assigned to the
  billing system in Proxmotion).



