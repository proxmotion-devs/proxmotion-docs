# ADR 0049: SSH Keys on Running Servers

- **Status**: Accepted
- **Date**: 2026-10-28

## Context
Public SSH keys historically reached a server only when created or reinstalled via cloud-init user data. Changing cloud-init user data causes host keys to regenerate on reboot. Proxmotion needed a mechanism to add/remove SSH public keys on running instances without downtime or rebooting.

## Decision
1. **Server-Level Keys**: Managed per server (`servers.ssh_keys`), bounded by `ssh_keys_max` (default 20, max 100).
2. **Guest Script Event (`ssh_keys_changed`)**:
   - **Linux/FreeBSD (`ssh-keys.sh`)**: Atomically updates `~root/.ssh/authorized_keys` (permissions `0700` / `0600`).
   - **Windows (`ssh-keys.ps1`)**: Writes to `C:\ProgramData\ssh\administrators_authorized_keys` with strict SYSTEM & Administrators ACLs.
3. **Execution Pipeline**: Dispatched via `change_ssh_keys` task. Stored state updates only after the guest agent reports success.
4. **Reinstalls**: Preserve current SSH keys unless explicitly overwritten or emptied.
