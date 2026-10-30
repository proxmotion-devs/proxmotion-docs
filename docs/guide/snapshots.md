# Snapshots Management

Snapshots allow point-in-time state capture of a virtual machine, enabling instant rollbacks.

## Slot Allocation

- Each server package defines `snapshot_slots` (e.g. 1, 3, 5).
- Customers cannot take more snapshots than their allocated slots unless an older snapshot is deleted.

## Modes

1. **Include RAM (Live state)**:
   - Captures running memory and disk state.
   - Restoring returns the VM to exact running state without boot sequence.
   - Requires storage supporting RAM state.

2. **Disk Only**:
   - Freezes disk contents at point in time.
   - Suitable for cold or safe backups when RAM capture is not required.

## Operations

- **Create**: Takes a named snapshot with optional description.
- **Rollback**: Reverts VM disks and state to the selected snapshot.
- **Delete**: Merges snapshot delta into base disk chain on Proxmox storage.
