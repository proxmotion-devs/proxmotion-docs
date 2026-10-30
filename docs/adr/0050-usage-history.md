# ADR 0050: Usage History and Graphs

- **Status**: Accepted
- **Date**: 2026-10-28

## Context
Raw 5-minute telemetry samples are kept for 48 hours for real-time limit checks. Storing them long-term produces ~105,000 rows per server per year. A rollup mechanism was required for multi-week and multi-month historical reporting.

## Decision
1. **Delta Counters**: `usage_samples` stores `net_in_bytes` and `net_out_bytes` per sampling window.
2. **Rollup Table (`usage_rollups`)**:
   - Aggregates by `resolution` (`hour` or `day`) in UTC.
   - Computes weighted averages for CPU %, Memory %, and Network/Disk byte rates.
   - Computes total transfer in and out.
3. **Retention**:
   - Hourly rollups: Kept 35 days.
   - Daily rollups: Kept 400 days.
4. **Ranges (`UsageHistory`)**:
   - `day`: 5-minute samples over 24 hours.
   - `week`: hourly rollups over 7 days.
   - `month`: hourly rollups over 30 days.
   - `year`: daily rollups over 365 days.
5. **Chart Rendering**: Custom lightweight SVG generation without heavy external chart libraries.
