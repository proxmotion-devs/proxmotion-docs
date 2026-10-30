# Guest Scripts & OS Templates

Proxmotion utilizes native guest agents and custom automation scripts to manage servers without requiring SSH credentials or external bastions.

## Supported OS Families

- **Debian / Ubuntu**: Cloud-init + `qemu-guest-agent`
- **RHEL / AlmaLinux / Rocky Linux**: Cloud-init + `qemu-guest-agent`
- **FreeBSD**: Cloud-init / native scripts + `qemu-guest-agent`
- **Windows Server (2019 - 2025)**: Cloudbase-Init + OpenSSH Server + `qemu-ga`

---

## 1. Fixed Lifecycle Hooks

Every OS template can define or override 5 built-in lifecycle hooks:

| Event | Trigger | Default Action | Timeout |
| --- | --- | --- | --- |
| `provisioned` | First boot after VM creation or reinstall | None (Available for custom initial setup) | 5 min |
| `addresses_changed` | When additional IPs are assigned or removed | Linux: updates interfaces / Windows: NetAdapter script | 5 min |
| `disk_resized` | Right after disk expansion on running instance | Expands filesystem (growpart / growfs / Windows partition) | 5 min |
| `password_reset` | Root / Administrator password change | Calls guest-set-user-password | 1 min |
| `hostname_changed` | VM hostname modification | Updates `/etc/hostname` or Windows ComputerName | 5 min |

---

## 2. Custom Scripts per Template (ADR 0043)

Administrators can attach unlimited custom scripts to any OS template:
- **Triggers**:
  - `manual`: Appears under *Run Script* in server management page.
  - Event-bound: Runs immediately following any built-in lifecycle event.
- **Execution Order**: Built-in hook runs first, followed by custom scripts in sequence.
- **Failure Isolation**: A failing custom script logs an error note on the task step but does not fail the primary VM operation.

---

## 3. Drafts, Trials & Live Run Logs (ADR 0023)

To ensure template scripts do not break production environments:
1. **Draft Mode**: Save changes as a draft without affecting existing or new servers.
2. **Trial Run**: Test draft or published script on any active server directly from the *Scripts* page.
3. **Trace Execution**: Run Linux shell scripts with `sh -x` to capture command-by-command debugging output.
4. **Encrypted Logs**: Stdout and stderr (up to 64 KiB) are captured in `guest_script_logs` and viewable in real-time.
5. **Emergency Cancellation**: Administrators can click *Stop Script* to immediately kill runaway processes inside guest VMs (`SIGSTOP` + `SIGKILL` on Linux, child tree termination on Windows).

