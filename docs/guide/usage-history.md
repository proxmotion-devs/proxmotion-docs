# Usage History & Statistics

Proxmotion collects metrics directly from Proxmox VE nodes to monitor server health and enforce fair bandwidth allocations.

## Metrics Collected

- **CPU Utilization (%)**: Average and peak processor load.
- **Memory Consumption (Bytes / %)**: Physical RAM utilized by guest.
- **Disk I/O**: Read and write throughput.
- **Network Traffic**: Ingress and egress byte counters.

## Aggregation & Storage

- High-frequency samples are captured via scheduled artisan tasks (`app:collect-usage`).
- Rollup records aggregate metrics over hourly, daily, and monthly intervals (`usage_rollups`).
- Billing modules query `GET /api/v1/servers/{server}/usage` to render live sparklines and historical charts inside client areas.
