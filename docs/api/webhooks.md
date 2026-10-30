# Webhooks Specification

Proxmotion delivers webhook events over HTTPS to billing systems (WHMCS, WISECP) or custom endpoints when server lifecycle operations and asynchronous background tasks complete.

## Security & Signature Verification

Each webhook payload is signed with a shared HMAC-SHA256 secret (`whsec_...`):

- **Header**: `X-Proxmotion-Signature`
- **Timestamp Header**: `X-Proxmotion-Timestamp`
- **Replay Protection**: Endpoints should reject signatures older than 300 seconds (5 minutes).

### Signature Calculation:
```
signature = hmac_sha256(timestamp + "." + raw_payload, signing_secret)
```

---

## Supported Events

| Event | Description | Payload Data |
| --- | --- | --- |
| `server.provisioned` | Server creation or reinstall completed | Server ID, hostname, assigned IP addresses |
| `server.suspended` | VM suspended (power stopped) | Server ID, suspension reason |
| `server.unsuspended` | VM unsuspended (power restored) | Server ID |
| `server.terminated` | VM and disks permanently removed | Server ID, released IP addresses |
| `server.failed` | Provisioning or task execution failed | Server ID, task step, error details |
| `server.task_failed` | Background task failed | Task ID, server ID, failure note |
| `app.installed` | App recipe installation finished | Server ID, installation ID, recipe slug |
| `app.failed` | App recipe installation or action failed | Server ID, installation ID, error message |
| `app.uninstalled` | App recipe uninstallation finished | Server ID, installation ID |
| `app.action_completed` | Custom app action (e.g. add VPN client) completed | Server ID, installation ID, run ID |

---

## Payload Format Example

```json
{
  "event": "server.provisioned",
  "id": "evt_01JBMX...",
  "created_at": 1730332800,
  "data": {
    "server": {
      "id": 104,
      "uuid": "8d39be27-38e2-45a8-9d21-fef891bb29e0",
      "external_id": "42",
      "hostname": "vps-104.example.com",
      "status": "active",
      "primary_ipv4": "198.51.100.15",
      "primary_ipv6": "2001:db8::15"
    }
  }
}
```
