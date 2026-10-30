# WISECP Module Integration

The official WISECP server module brings Proxmotion multi-tenant provisioning to WISECP platforms.

## Installation

1. Copy module directory:
   ```
   integrations/wisecp/coremio/modules/Servers/Proxmotion/ -> <wisecp_root>/coremio/modules/Servers/Proxmotion/
   ```
2. In WISECP Admin: **Services > Hosting / Server Settings > Server List**.
3. Create a server selecting `Proxmotion`.
4. Provide API Endpoint URL and Panel Token.

## Functionality

- Automated activation, suspension, unsuspend, and termination handlers.
- Integrated tools pages for SSH Keys (`pages/tools/ssh-keys.php`), Snapshots (`pages/tools/snapshots.php`), and Backups (`pages/tools/backups.php`).
- Automated webhook listener (`src/WebhookReceiver.php`) for task status syncing.
