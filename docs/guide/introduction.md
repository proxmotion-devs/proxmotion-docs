# What is Proxmotion?

Proxmotion is an open-source (AGPL-3.0), multi-tenant **VPS management panel for Proxmox VE**, built in the spirit of tools like Virtualizor and VirtFusion.

- Hosting providers connect their **Proxmox nodes and clusters** to the Proxmotion panel.
- When a customer purchases a VPS in a **billing system** (WHMCS or WISECP), the billing module calls the Proxmotion API and the server is **provisioned automatically**.
- The customer manages the server directly from the **billing system's client area**: power control, console, reinstall, root password, rDNS, apps, SSH keys, snapshots, and backups.

## Two Faces of Proxmotion

| Face | Who uses it | What it is |
| --- | --- | --- |
| **Admin Panel** | Staff only | A web UI (Vue 3 + Inertia + Laravel) for infrastructure, IP pools, packages, OS templates, apps, servers, billing systems, and audit trails. |
| **Billing API + Modules** | Billing systems (WHMCS / WISECP) | A versioned REST API (`/api/v1`) and ready-made WHMCS and WISECP server modules. |

> **Billing-Only Design:** There is no separate customer login portal. Customers interact exclusively through their hosting provider's billing system client area.

## Key Goals in v0.1

1. **SSH Keys Management**: Live synchronization of public SSH keys across Linux and Windows instances via guest agent pipelines.
2. **Snapshot Management**: Slot-limited, live-state or disk-only VM snapshots directly manageable by customers.
3. **Backup Management**: Manual and slot-controlled Proxmox backups with restore capabilities.
4. **Historical Usage Tracking**: Periodic resource usage rollups (CPU, RAM, Disk, Bandwidth) and sparkline charts.
