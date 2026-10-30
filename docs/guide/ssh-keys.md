# SSH Keys Management

In Proxmotion v0.1, users can manage SSH public keys directly without needing manual intervention or server reboot.

## Features

- **Slot Limitation**: Packages specify maximum allowed SSH keys per instance.
- **Multi-OS Support**: Handles key injection for both Linux (`~/.ssh/authorized_keys`) and Windows OpenSSH environments.
- **Guest Agent Execution**: Uses QEMU Guest Agent commands to write public keys into running instances.
- **Cloud-Init Integration**: Initial server creation injects configured public keys during provisioning.

## Execution Workflow

1. Client adds, replaces, or deletes public keys in client area (WHMCS/WISECP).
2. Billing module dispatches `POST /api/v1/servers/{server}/ssh-keys`.
3. Proxmotion runs `SshKeysPipeline`.
4. If guest agent is online, guest script writes keys to proper user profile directory.
5. If server is powered off, keys are staged and updated in server metadata.
