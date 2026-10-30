# Backups Management

Proxmotion v0.1 introduces customer-accessible backup management backed by Proxmox storage volumes (`vzdump`).

## Slot Management

- Backups are restricted by `backup_slots` defined in package tiers.
- When all slots are consumed, creation of new backups is rejected until an existing volume is deleted.

## Supported Operations

- **Manual Backups**: Triggered directly by the customer from billing client area.
- **Restore**: Restores VM configuration and disk images from backup archive (`RestoreBackupPipeline`).
- **Download / Volume Deletion**: Automated volume lifecycle cleanup to ensure storage quotas are respected.
