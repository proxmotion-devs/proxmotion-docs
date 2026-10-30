# WHMCS Module Integration

The official WHMCS module integrates Proxmotion provisioning into standard WHMCS product workflows.

## Installation

1. Copy directory:
   ```
   integrations/whmcs/modules/servers/proxmotion/ -> <whmcs_root>/modules/servers/proxmotion/
   ```
2. Navigate to WHMCS Admin: **Configuration > System Settings > Servers**.
3. Add a new server with type `Proxmotion`.
4. Enter your Proxmotion Panel URL and API Token generated in Admin Panel.

## Features Supported in Client Area

- **Power Actions**: Start, Shutdown, Reboot, Stop.
- **VNC Web Console**: One-time signed terminal access.
- **SSH Keys Management**: Add, view, and purge authorized SSH keys.
- **Snapshots & Backups**: Create, rollback, and delete snapshots/backups within assigned package slots.
- **Usage Graphs**: Live CPU, memory, and network usage charts.
- **Reinstallation**: Self-service OS reinstallation using assigned OS templates.
