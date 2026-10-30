# Core Architecture & Concepts

Proxmotion separates administrative control from automated customer provisioning through clear domain concepts.

## Core Hierarchy

```
Cluster (Proxmox VE API)
 └── Nodes (Physical Proxmox hypervisors)
      └── Storages (local-zfs, ceph, lvm-thin, etc.)

Location (e.g. Frankfurt DC)
 ├── Placement Groups (Anti-affinity, hardware grouping)
 ├── IP Pools (Subnets, Gateway, DNS, Allocation pools)
 └── Nodes mapping

Packages (Product definition)
 ├── CPU Cores & Type
 ├── Memory (RAM)
 ├── Disk Size & Storage target
 ├── Bandwidth limits & Speeds
 └── Feature slots (Snapshot slots, Backup slots, SSH key limits)
```

## Task Execution Pipeline

Server actions do not block web requests. Proxmotion uses asynchronous pipeline jobs:

1. **API Request received**: Validated against billing system tokens and server ownership.
2. **Task Record created**: Emits database record with pending state and returns task identifier.
3. **Queue Execution**: Laravel queue workers run dedicated pipelines (`CreateServerPipeline`, `SnapshotPipeline`, `RestoreBackupPipeline`, etc.).
4. **Proxmox UPID Polling**: Worker monitors Proxmox tasks until completion or failure.
5. **Webhook Notification**: Emits webhook events to billing systems upon task resolution.
