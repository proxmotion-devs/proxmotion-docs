# App Recipes Specification & Development

Proxmotion App Marketplace allows customers to install, manage, upgrade, and configure complex applications (Docker, WireGuard, OpenVPN, Web servers, Database stacks) directly inside their guest virtual machines.

All operations execute inside the guest VM via the **QEMU Guest Agent**, eliminating the need for cloud-init snippets, external bastions, or open SSH ports.

---

## 1. Directory Structure

A recipe package (`.proxapp` package directory) contains `recipe.yaml` and its execution scripts:

```
recipe-name/
 ├── recipe.yaml              # App metadata, requirements, inputs, outputs, lifecycle
 ├── install.sh (or .ps1)     # Installation runner script
 ├── uninstall.sh (or .ps1)   # Clean removal script
 ├── upgrade.sh (or .ps1)     # Version migration script
 ├── README.md                # Documentation & instructions
 └── actions/                 # Custom day-2 operations
      └── add-client.sh
```

---

## 2. Recipe Manifest (`recipe.yaml`) Format v2

```yaml
format: 2
slug: wireguard
version: 1.3.0
name: WireGuard
category: vpn
description:
  en: "Fast, modern, secure VPN tunnel."
  tr: "Hızlı, modern ve güvenli VPN tüneli."
maintainers:
  - name: Proxmotion Team
    url: https://github.com/proxmotion-devs
homepage: https://www.wireguard.com
license: none
billing: free # free | paid

# Platform and OS targeting
requires:
  platform: linux # linux | windows
  os: [debian, rhel]
  min_versions:
    ubuntu: "22.04"
    debian: "12"

# Minimum hardware limits
resources:
  min_cores: 1
  min_memory_mib: 512
  min_disk_mib: 5120

network_models: [bridged, routed, nat]
install_modes: [order, post]

# Input parameters requested from customer or billing module
inputs:
  - key: vpn_port
    type: port
    label: { en: "Listen Port", tr: "Dinleme Portu" }
    default: 51820
    required: true

# Outputs extracted from the guest after installation
outputs:
  - key: public_key
    type: string
    label: { en: "Server Public Key", tr: "Sunucu Açık Anahtarı" }
    secret: false

firewall:
  - protocol: udp
    port: 51820

lifecycle:
  install:
    script: install.sh
    timeout_minutes: 10
  uninstall:
    script: uninstall.sh
    timeout_minutes: 5
  upgrade:
    script: upgrade.sh
    timeout_minutes: 10
    from: ">=1.0.0 <1.3.0"

actions:
  - key: add_client
    label: { en: "Add Client", tr: "İstemci Ekle" }
    script: actions/add-client.sh
    inputs:
      - key: client_name
        type: slug
        required: true
    outputs:
      - key: client_config
        type: file
        filename: client.conf
        secret: true
    timeout_minutes: 2
```

---

## 3. Supported Input Types

Inputs are never injected into bash/powershell strings. They are validated strictly on the panel, written to `inputs.json`, and accessed via helper functions.

- `string`: Standard single-line text
- `password`: Masked sensitive string (automatically excluded from raw logs)
- `integer`: Number range
- `port`: TCP/UDP port number (`1` to `65535`)
- `boolean`: Checkbox true/false
- `enum`: Multiple choice list
- `slug`: Letters, digits, hyphens, and underscores only (`^[a-z0-9][a-z0-9_-]*$`)
- `email`: Valid email address
- `domain`: Valid domain/FQDN
- `url`: Secure HTTPS endpoint (`https://...`)

---

## 4. Execution Helpers (`proxmotion.sh` & `proxmotion.ps1`)

During execution, the runner loads the helper library inside the VM:
- Linux: `. "$PROXMOTION_APP_DIR/proxmotion.sh"`
- Windows: `. "$env:PROXMOTION_APP_DIR\proxmotion.ps1"`

### Linux Shell Helper Functions:

| Function | Description |
| --- | --- |
| `pm_step <progress> <message>` | Reports progress percentage (0-99) and current step to the panel. |
| `pm_status <status> <progress> <step> [msg]` | Sets raw status (`installing`, `installed`, `failed`). |
| `pm_input <key>` | Reads an input value passed to this execution from `inputs.json`. |
| `pm_app_input <key>` | Reads original installation inputs during an action or uninstall. |
| `pm_server <key>` | Retrieves server metadata (`hostname`, `primary_ipv4`, `primary_ipv6`). |
| `pm_output <key> <val>` | Stores text or URL output returned to customer client area. |
| `pm_output_file <filename> <src>` | Securely saves generated files (e.g. VPN profile or SSL certificate). |
| `pm_fail <message>` | Terminates execution with an explicit error shown to user. |
| `pm_wait_for_boot [sec]` | Waits until `cloud-init` finishes and `apt`/`dnf` package locks release. |
| `pm_pkg_install <packages>` | Installs packages dynamically adapting to `apt` or `dnf`. |
| `pm_public_address` | Returns primary public IP or hostname. |
| `pm_enable_forwarding <name>` | Sets persistent IPv4/IPv6 packet forwarding in `/etc/sysctl.d/`. |

### Windows PowerShell Functions:

| Function | Description |
| --- | --- |
| `Pm-Step -Progress <int> -Message <str>` | Reports percentage and status message. |
| `Pm-Input -Key <str>` | Fetches input argument safely. |
| `Pm-Server -Key <str>` | Fetches hostname or server IP addresses. |
| `Pm-Output -Key <str> -Value <str>` | Emits customer-facing result. |
| `Pm-OutputFile -FileName <str> -Source <path>` | Emits secure downloadable result file. |
| `Pm-RequestRestart` | Signals Windows reboot required; runner automatically reboots and resumes. |
| `Pm-Feature -Server <names> -Desktop <names>` | Enables Windows features / roles. |
| `Pm-FirewallPort -Name <str> -Protocol <TCP/UDP> -Ports <list>` | Configures Windows Firewall inbound rule. |
| `Pm-RandomPassword -Length <int>` | Cryptographically secure password generator. |
| `Pm-WaitForInstaller [sec]` | Waits until msiexec lock is released. |

---

## 5. Sample Recipes

### Linux Recipe (`install.sh` example):
```bash
#!/bin/bash
set -euo pipefail

. "$PROXMOTION_APP_DIR/proxmotion.sh"

pm_wait_for_boot 300

pm_step 20 "Installing dependencies"
pm_pkg_install wireguard qrencode

pm_step 60 "Configuring WireGuard interface"
PORT=$(pm_input vpn_port)
PRIVKEY=$(wg genkey)
PUBKEY=$(echo "$PRIVKEY" | wg pubkey)

cat <<EOF > /etc/wireguard/wg0.conf
[Interface]
Address = 10.0.0.1/24
ListenPort = $PORT
PrivateKey = $PRIVKEY
EOF

systemctl enable --now wg-quick@wg0

pm_output "public_key" "$PUBKEY"
pm_step 100 "WireGuard setup complete"
```

### Windows Recipe (`install.ps1` example):
```powershell
$ErrorActionPreference = 'Stop'
. "$env:PROXMOTION_APP_DIR\proxmotion.ps1"

Pm-WaitForInstaller 300

Pm-Step 25 "Enabling Web Server Role (IIS)"
$restartNeeded = Pm-Feature -Server @("Web-Server", "Web-Asp-Net45") -Desktop @("IIS-WebServerRole")

Pm-Step 65 "Configuring Firewall"
Pm-FirewallPort -Name "HTTP" -Protocol "TCP" -Ports @("80", "443")

$ip = Pm-Server "primary_ipv4"
Pm-Output "site_url" "http://$ip/"

if ($restartNeeded) {
    Pm-RequestRestart
}

Pm-Step 100 "IIS Installation completed"
```
