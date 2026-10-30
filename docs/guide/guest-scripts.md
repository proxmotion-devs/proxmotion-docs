# Guest Scripts & OS Templates

Proxmotion utilizes native guest agents and custom automation scripts to manage servers without requiring SSH credentials or external bastions.

## Supported OS Families

- **Debian / Ubuntu**: Cloud-init + `qemu-guest-agent`
- **RHEL / AlmaLinux / Rocky Linux**: Cloud-init + `qemu-guest-agent`
- **FreeBSD**: Cloud-init / native scripts + `qemu-guest-agent`
- **Windows Server (2019 - 2025)**: Cloudbase-Init + OpenSSH Server + `qemu-ga`

## Guest Script Events

Proxmotion triggers lifecycle hooks inside guest instances via the Proxmox Guest Agent:

| Event | Trigger | Default Script Action |
| --- | --- | --- |
| `ssh_keys_changed` | User adds/removes public keys | Synchronizes `authorized_keys` or Windows OpenSSH admin ACLs. |
| `password_reset` | User initiates password reset | Invokes guest agent user password modification. |
| `post_install` | First boot after provisioning | Runs custom deployment scripts configured by admin. |
| `network_configured` | Static IP change | Adjusts interfaces/netplan if hot-plugged. |
