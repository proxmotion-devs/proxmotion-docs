# ADR 0051: Snapshots and Backups

- **Status**: Accepted
- **Date**: 2026-10-28

## Context
Hosting customers and administrators require rollbacks and disaster recovery. Snapshots live on the VM's storage (fast, zero external room), while backups (`vzdump`) are full archives stored on dedicated backup storages or Proxmox Backup Server.

## Decision

### 1. Limits & Slots
- Packages configure `snapshot_slots` and `backup_slots` (0 to 100, default 0).
- Limits copy to `servers.snapshot_slots` and `servers.backup_slots` on provision.

### 2. Snapshots Behavior
- **No RAM state**: `vmstate=0` is enforced for consistency and storage safety across all snapshots.
- Stored directly in `snapshots` table.
- Rollback restores disk state while maintaining current panel identity and network assignments.

### 3. Backups Behavior
- Proxmox backup volumes (`vzdump`) associated with instances.
- **Server Isolation**: Backups belong strictly to the originating server; cross-server restores are disallowed.
- Restores run asynchronously via `RestoreBackupPipeline`.
- Server termination triggers cascading volume cleanup jobs (`DeleteBackupVolume`).
