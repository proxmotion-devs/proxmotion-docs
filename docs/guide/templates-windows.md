# Windows templates

*Türkçe: [tr/windows-templates.md](tr/windows-templates.md)*

This guide explains how a Windows template for Proxmotion works and how to build one for every
current Windows version, **Windows Server 2016, 2019, 2022 and 2025** and **Windows 10 and 11**, in
two separate ways: **with Sysprep** (Microsoft's supported way) and **without Sysprep** (faster,
with known costs). It explains why each step is there and where the versions differ, so you can
adapt it to your own image and check the result.

Linux templates have their own guide: [iso-templates.md](iso-templates.md).

**Contents**

1. [How a Windows server is born from a template](#how-a-windows-server-is-born-from-a-template)
2. [Windows versions at a glance](#windows-versions-at-a-glance)
3. [Making clones unique: with or without Sysprep](#making-clones-unique-with-or-without-sysprep)
4. [Build the base system](#build-the-base-system) (both ways): [ISOs](#1-isos) · [VM](#2-create-the-vm) · [Install](#3-install-windows) · [Prepare](#4-prepare-windows) · [Administrator](#5-the-administrator-account) · [Cloudbase-Init](#6-install-cloudbase-init)
5. [Way A: with Sysprep](#way-a-with-sysprep)
6. [Way B: without Sysprep](#way-b-without-sysprep)
7. [Turn the VM into a template](#turn-the-vm-into-a-template) (both ways)
8. [Add it to the panel and test it](#add-it-to-the-panel-and-test-it)
9. [Configuration files explained](#configuration-files-explained)
10. [How fast a new server can be ready](#how-fast-a-new-server-can-be-ready)
11. [Updating a template](#updating-a-template)
12. [What the panel does for Windows](#what-the-panel-does-for-windows)
13. [Troubleshooting](#troubleshooting)
14. [Not verified yet](#not-verified-yet)

## How a Windows server is born from a template

When the panel creates a server, it clones the template, sets cores, memory, the network card and
the cloud-init fields (password, addresses, DNS, VM name), grows the disk and starts the VM. For a
VM whose OS type is **Microsoft Windows**, Proxmox writes the cloud-init fields as a *config drive*
(a small CD labelled `config-2`):

| File on the CD | Content | Read by |
|---|---|---|
| `meta_data.json` | `uuid` (the *instance ID*), `admin_pass`, SSH keys | Cloudbase-Init: password |
| `network_data.json` | addresses, gateway, DNS | Cloudbase-Init: network |
| `user_data` | `#cloud-config` with `hostname: …` | Cloudbase-Init's `UserDataPlugin`: computer name |

Only for a Windows OS type does Proxmox put the password there in plain text; for other types it
stores a hash, which Windows cannot use.

**Cloudbase-Init** is the Windows counterpart of cloud-init. Its *plugins* each do one job, and it
remembers in the registry, per instance ID, which plugins already ran. A clone has a new instance
ID, so every plugin runs once on it; on later boots they are skipped.

The panel then waits until Windows is ready (see [What the panel does](#what-the-panel-does-for-windows)):
the guest agent answers, Windows setup reports `IMAGE_STATE_COMPLETE`, the `cloudbase-init` service
has stopped after recording every plugin of its configuration as done for this server's instance
ID, and no new computer name waits for a restart. Then it runs its own scripts (additional
addresses) through the guest agent.
Customers log in with Remote Desktop as **`Administrator`**, the account whose password the panel
sets and resets.

So every Windows template, whatever the version, needs: the **VirtIO drivers** (disk and network),
the **QEMU guest agent**, an enabled built-in **`Administrator`** account, **Cloudbase-Init**
configured to read the config drive, **Remote Desktop** on, and a way to make every clone a
**different machine**, which is where the two ways differ.

## Windows versions at a glance

The steps are the same for all versions; this table collects what differs. The rows are referred to
below.

| | Server 2016 | Server 2019 | Server 2022 | Server 2025 | Windows 10 (22H2) | Windows 11 (24H2, 25H2) |
|---|---|---|---|---|---|---|
| Proxmox OS type | `10/2016/2019` | `10/2016/2019` | `11/2022/2025` | `11/2022/2025` | `10/2016/2019` | `11/2022/2025` |
| VirtIO driver folder | `2k16` | `2k19` | `2k22` | `2k25` | `w10` | `w11` |
| Smallest template disk | 32 GiB | 32 GiB | 32 GiB | 32 GiB | 32 GiB | **64 GiB** |
| Memory for setup | 2 GiB | 2 GiB | 2 GiB | 2 GiB | 2 GiB | **4 GiB** |
| TPM 2.0 and Secure Boot | no | no | no | no | no | **required** (TPM state, EFI disk with pre-enrolled keys) |
| CPU | any | any | any | **x86-64-v2** (SSE4.2, POPCNT) | any | **x86-64-v2**, 2 cores |
| Built-in `Administrator` | enabled | enabled | enabled | enabled | **disabled** | **disabled** |
| Setup without a Microsoft account | yes | yes | yes | yes | yes (offline account) | Enterprise, Education, IoT LTSC; Pro and Home only through audit mode or an answer file |
| Remote Desktop host | yes | yes | yes | yes | Pro, Enterprise, Education (**not Home**) | Pro, Enterprise, Education (**not Home**) |
| Way A (Sysprep) | yes | yes | yes | yes | yes, from audit mode | yes, from audit mode |
| Way B (no Sysprep) | possible | possible | possible | **no** (shared SID breaks authentication) | possible | **no** (shared SID breaks authentication) |
| Microsoft support ends | January 2027 | January 2029 | October 2031 | November 2034 | **ended October 2025** (ESU only) | per release (24 or 36 months) |

The table uses Windows' own defaults; the dates are Microsoft's published lifecycle dates. Older
releases (Server 2012 R2, Windows 8.1) are out of support and the current VirtIO drivers no longer
ship for them.

**Licensing.** Activation and licensing (SPLA, AVMA, KMS, MAK) are your responsibility; the template
contains no product key unless you add one. Note that **Windows 10 and 11 are desktop systems**:
Microsoft's licence terms do not allow renting them to third parties through SPLA, and
multi-tenant hosting of client Windows is only possible through Microsoft's Qualified Multitenant
Hoster (QMTH) program with customers' own licences. Check with your licensing provider before you
sell client Windows.

## Making clones unique: with or without Sysprep

A Windows installation carries values that should differ on every machine. Sysprep's *generalize*
pass removes them; the first boot of each clone then runs Windows setup's *specialize* pass and
OOBE, which create new ones. Without Sysprep the clone starts as an exact copy, and you remove what
matters yourself.

| | Way A: with Sysprep | Way B: without Sysprep |
|---|---|---|
| Supported by Microsoft | yes, the only supported way to duplicate an installation | no |
| First boot of a clone | *specialize* pass, one restart, OOBE, then Cloudbase-Init (about 1.5 min plus the clone on Server 2022, measured) | a normal boot, Cloudbase-Init, one restart for the computer name (not measured; expected clearly shorter) |
| Machine SID | new on every clone | **the same on every server** |
| Remote Desktop certificate | new | new, if you delete it in the template (B2) |
| Windows Update / WSUS client ID | new | new, if you delete it in the template (B2) |
| KMS activation | works (new client machine ID) | every clone looks like the same client to a KMS host; use MAK, AVMA or retail keys |
| Drivers | detected again on the first boot (unless `PersistAllDeviceInstalls`) | already installed |
| Building the template | Sysprep stops on Store apps updated for one user (Edge on servers, many apps on Windows 10/11) | no Sysprep errors |

**What the shared SID means.** For standalone servers that never authenticate to each other,
duplicate machine SIDs have long caused little trouble. That is no longer true everywhere:
Microsoft's release notes say that since the September 2025 updates, Windows 11 24H2 and later and
Windows Server 2025 fail NTLM and Kerberos authentication between machines with the same SID (for
example a file share between two of a customer's servers), and that this is by design. Domain
controllers and some management software never accepted duplicate SIDs.

**Which to choose.** Way A for anything you sell broadly, and always for Windows Server 2025 and
Windows 11. Way B only for Server 2016, 2019, 2022 and Windows 10, when first-boot time matters more
than support, and when you accept that servers built from one template share their SID.

The panel works the same way with both; it needs no setting for it.

## Build the base system

Steps 1–6 are the same for both ways. Where a step differs between versions, it says so.

### 1. ISOs

On a storage with the **ISO image** content type (*Node → `local` → ISO Images → Upload* or
*Download from URL*):

- the **Windows** ISO of your version (Server: evaluation or volume licensing media; client: the
  Media Creation Tool's ISO or volume licensing media; Enterprise or Education for Windows 11 makes
  step 3 easier), and
- the **VirtIO drivers** ISO, stable release from the Fedora project:
  `https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/stable-virtio/virtio-win.iso`.

### 2. Create the VM

*Create VM*, with a VMID outside the range of your servers (e.g. 9000 and up) and a name that says
version and way, such as `tpl-win2022-sysprep-20261027`. Each setting has a reason:

| Tab | Setting | Why |
|---|---|---|
| General | *Resource Pool*: the panel's pool, if its API token is limited to one | The token only clones what it can see |
| OS | The Windows ISO; *Type* **Microsoft Windows** with the version from the [table](#windows-versions-at-a-glance); tick **Add additional drive for VirtIO drivers** with `virtio-win.iso` | The OS type decides the config drive format and that the password reaches Cloudbase-Init, and makes Proxmox offer the right defaults |
| System | *Machine* q35, *BIOS* **OVMF (UEFI)** with an EFI disk (pre-enrolled keys, which turns Secure Boot on), *SCSI Controller* VirtIO SCSI single, **QEMU Agent** on. **Windows 11:** also *Add TPM*, version v2.0 | Modern firmware for every version; Windows 11 setup refuses to install without TPM 2.0 and Secure Boot |
| Disks | Bus SCSI, the smallest size from the table (32 GiB, Windows 11 64 GiB), **Discard** and **SSD emulation** on | The panel grows the disk per package but never shrinks it: the template's size is the smallest disk a package for it can have. *Discard* lets the template shrink (A3/B3) |
| CPU | 1 socket, **4 cores** while you build, *Type* default (`x86-64-v2-AES`), not `host`, never `kvm64` | Updates install faster; `host` ties clones to one CPU model; Server 2025 and Windows 11 need x86-64-v2, which `kvm64` lacks. The panel sets each server's count |
| Memory | 4096 MiB, ballooning off | Enough for every version's setup; the panel sets each server's value |
| Network | Model VirtIO, a bridge with internet access | Updates. Cloudbase-Init replaces this configuration on every clone |

On Windows 11 the TPM state is part of the template and is copied into every clone, so all servers
share the same virtual TPM identity. That is harmless for a VPS; do not rely on TPM attestation.

### 3. Install Windows

1. Press a key when the console shows *Press any key to boot from CD or DVD*.
2. Choose the edition you are licensed for (Server: *Desktop Experience* or *Core*).
3. At *Where do you want to install Windows?* no disk is listed, because Windows has no driver for
   VirtIO SCSI: *Load driver* → the VirtIO CD → `vioscsi\<folder from the table>\amd64`. Install to
   the disk that appears. Windows creates its own partitions with `C:` last, which is what lets `C:`
   grow later. (Windows 11's newer setup shows the same choice under *Load driver*.)
4. **Windows Server:** set a temporary Administrator password and log in.
5. **Windows 10 and 11:** setup ends in OOBE, which asks for an account. Which way you go decides
   what to do here:
   - **Way A:** at the first OOBE screen (region) press **Ctrl+Shift+F3**. Windows restarts into
     **audit mode**, logged in as the built-in Administrator, without creating any account and
     without asking for a Microsoft account. Close the *System Preparation Tool* window that opens;
     every restart comes back to audit mode until Sysprep ends it. Do all of steps 4–6 and Way A in
     audit mode.
   - **Way B:** finish OOBE with a temporary **local** account (e.g. `setup`). Windows 10 offers an
     *offline account*; Windows 11 Enterprise, Education and IoT LTSC offer *Domain join instead*.
     Windows 11 Pro and Home insist on a Microsoft account and Microsoft keeps removing the ways
     around it; for them use Way A, or an `autounattend.xml` on the install media that creates a
     local account.

### 4. Prepare Windows

1. On the VirtIO CD run **`virtio-win-guest-tools.exe`**: all VirtIO drivers (network, balloon,
   serial) and the QEMU guest agent. (On Server Core start it from the command prompt.)
2. Install all Windows updates and restart until *Settings → Windows Update* offers nothing and
   asks for no restart. Updates still pending in the template finish on **every** new server, with
   extra restarts.
3. In PowerShell as Administrator, turn on what a customer expects and turn off what only slows a
   server down:

   ```powershell
   # Remote Desktop (off by default) and its firewall rules; the group is named by its
   # resource string so this works in every display language
   Set-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -Value 0
   Enable-NetFirewallRule -Group '@FirewallAPI.dll,-28752'
   # Answer ping (IPv4 and IPv6), useful for customers' monitoring
   Enable-NetFirewallRule -Name FPS-ICMP4-ERQ-In, FPS-ICMP6-ERQ-In
   # No hibernation file and no Fast Startup, high-performance power plan
   powercfg /hibernate off
   powercfg /setactive SCHEME_MIN
   # Servers: no Server Manager window at every logon (no such task on Windows 10/11)
   Get-ScheduledTask -TaskName ServerManager -ErrorAction SilentlyContinue | Disable-ScheduledTask
   ```

   Remote Desktop keeps Network Level Authentication on. Leave the Windows firewall itself on; the
   panel filters outside the VM with the Proxmox firewall. Answering ping is a choice.
   `powercfg /hibernate off` also turns off **Fast Startup** on Windows 10 and 11, which otherwise
   turns a shutdown into a hibernation: a template "shut down" that way is not cleanly shut down.

4. **Windows 10 and 11 only:**

   ```powershell
   # Device encryption must be off: clones would share the key, the panel could not grow C:,
   # and Sysprep refuses an encrypted drive
   manage-bde -status C:
   manage-bde -off C:      # only if it says the volume is encrypted; wait until it is fully decrypted
   # Stop Windows installing promoted Store apps for each user (Enterprise and Education honour it)
   New-Item 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent' -Force | Out-Null
   Set-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent' -Name DisableWindowsConsumerFeatures -Value 1
   ```

5. **Check the agent** from the node's shell, while the VM runs:

   ```bash
   qm guest cmd <vmid> ping
   qm guest exec <vmid> -- powershell -NoProfile -Command '$PSVersionTable.PSVersion'
   ```

   The panel's scripts and Windows apps need Windows PowerShell 5.1, which every version in the
   table has.

### 5. The Administrator account

The panel, its password reset and Cloudbase-Init all use the account named **`Administrator`**: the
built-in account whose SID ends in `-500`. Check it:

```powershell
Get-LocalUser | Where-Object { $_.SID -like '*-500' } | Format-Table Name, Enabled
```

- **Its name must be `Administrator`.** Some display languages give it another name (French
  *Administrateur*, Spanish *Administrador*, …). Rename it, or install from English media:
  `Get-LocalUser | Where-Object { $_.SID -like '*-500' } | Rename-LocalUser -NewName Administrator`.
- **It must be enabled on every clone.** Windows Server enables it. Windows 10 and 11 disable it,
  and Sysprep disables it again when it ends audit mode. So the template enables it on each clone's
  first boot with a Cloudbase-Init *local script* (run by `LocalScriptsPlugin` as SYSTEM, after the
  password has been set). Save this as
  `C:\Program Files\Cloudbase Solutions\Cloudbase-Init\LocalScripts\enable-administrator.ps1` once
  Cloudbase-Init is installed (step 6). It is harmless on servers, so use it everywhere:

  ```powershell
  # Proxmotion: the panel logs customers in as the built-in Administrator
  Get-LocalUser | Where-Object { $_.SID -like '*-500' } | Enable-LocalUser
  ```

### 6. Install Cloudbase-Init

Download it from `https://cloudbase.it/cloudbase-init/` and run the installer: user name
`Administrator`, tick *Run Cloudbase-Init service as LocalSystem*. Then add the local script of
step 5.

The last page of the installer offers to run Sysprep. **Way A:** do not click *Finish* yet, the next
steps need it. **Way B:** leave both boxes unticked and click *Finish*.

Its configuration lives in `C:\Program Files\Cloudbase Solutions\Cloudbase-Init\conf\`:

| File | When it is used |
|---|---|
| `cloudbase-init.conf` | by the **service**, at every boot (both ways) |
| `cloudbase-init-unattend.conf` | by Windows setup's *specialize* pass (Way A only) |
| `Unattend.xml` | the answer file Sysprep hands to Windows setup (Way A only) |

## Way A: with Sysprep

### A1. Configure Cloudbase-Init

The aim: everything a clone needs is set **during the specialize pass**, whose restart Windows does
anyway, so no further restart is needed; the service then only sets the password, the network, and
runs the local script.

`cloudbase-init-unattend.conf`, run in the specialize pass. It sets the computer name there (taking
effect with Windows' own restart), extends `C:`, and never restarts by itself:

```ini
[DEFAULT]
username=Administrator
groups=Administrators
inject_user_password=true
first_logon_behaviour=no
metadata_services=cloudbaseinit.metadata.services.configdrive.ConfigDriveService
check_latest_version=false
log_dir=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\log\
log_file=cloudbase-init-unattend.log
plugins=cloudbaseinit.plugins.common.sethostname.SetHostNamePlugin,cloudbaseinit.plugins.windows.extendvolumes.ExtendVolumesPlugin,cloudbaseinit.plugins.common.userdata.UserDataPlugin
allow_reboot=false
stop_service_on_exit=false

[config_drive]
types=iso
locations=cdrom
```

`cloudbase-init.conf`, the service, at every boot. Password first, then the network:

```ini
[DEFAULT]
username=Administrator
groups=Administrators
inject_user_password=true
first_logon_behaviour=no
metadata_services=cloudbaseinit.metadata.services.configdrive.ConfigDriveService
check_latest_version=false
mtu_use_dhcp_config=false
ntp_use_dhcp_config=false
log_dir=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\log\
log_file=cloudbase-init.log
local_scripts_path=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\LocalScripts\
plugins=cloudbaseinit.plugins.common.setuserpassword.SetUserPasswordPlugin,cloudbaseinit.plugins.common.networkconfig.NetworkConfigPlugin,cloudbaseinit.plugins.common.sshpublickeys.SetUserSSHPublicKeysPlugin,cloudbaseinit.plugins.common.localscripts.LocalScriptsPlugin
allow_reboot=true
stop_service_on_exit=true

[config_drive]
types=iso
locations=cdrom
```

`Unattend.xml`: change these parts and leave the rest as Cloudbase-Init installed it.

1. **All versions.** In the `specialize` pass, the Cloudbase-Init command must not ask for a
   restart. Replace `&amp;&amp; exit 1 || exit 2` with `&amp; exit 0` and `OnRequest` with `Never`
   (keep `&amp;` as it is: a bare `&` breaks the XML):

   ```xml
   <RunSynchronousCommand wcm:action="add">
     <Order>1</Order>
     <Path>cmd.exe /c ""C:\Program Files\Cloudbase Solutions\Cloudbase-Init\Python\Scripts\cloudbase-init.exe" --config-file "C:\Program Files\Cloudbase Solutions\Cloudbase-Init\conf\cloudbase-init-unattend.conf" &amp; exit 0"</Path>
     <Description>Run Cloudbase-Init to set the hostname</Description>
     <WillReboot>Never</WillReboot>
   </RunSynchronousCommand>
   ```

2. **Windows 10 and 11.** OOBE must not stop at a question: nobody answers it on a VPS. Replace the
   `Microsoft-Windows-Shell-Setup` component of the `oobeSystem` pass with the one below and add the
   `International-Core` component next to it. The locale values skip the region and keyboard
   screens (use yours, e.g. `tr-TR`); `AdministratorPassword` lets OOBE skip account creation and is
   replaced by Cloudbase-Init at the first boot (use a long random value, not a real password):

   ```xml
   <settings pass="oobeSystem">
     <component name="Microsoft-Windows-International-Core" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
       <InputLocale>en-US</InputLocale>
       <SystemLocale>en-US</SystemLocale>
       <UILanguage>en-US</UILanguage>
       <UserLocale>en-US</UserLocale>
     </component>
     <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
       <OOBE>
         <HideEULAPage>true</HideEULAPage>
         <HideOEMRegistrationScreen>true</HideOEMRegistrationScreen>
         <HideOnlineAccountScreens>true</HideOnlineAccountScreens>
         <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>
         <HideLocalAccountScreen>true</HideLocalAccountScreen>
         <ProtectYourPC>3</ProtectYourPC>
       </OOBE>
       <UserAccounts>
         <AdministratorPassword>
           <Value>a-long-random-value-replaced-at-first-boot</Value>
           <PlainText>true</PlainText>
         </AdministratorPassword>
       </UserAccounts>
     </component>
   </settings>
   ```

3. *Optional, all versions:* add a `generalize` pass (directly inside `<unattend>`, next to the other
   `<settings>`) that keeps the installed drivers, so the first boot does not detect every device
   again. Microsoft allows it only when every destination has exactly the hardware of the reference
   machine: use it only while every server keeps the template's virtual hardware (same disk bus,
   network model and machine type), and leave it out when in doubt:

   ```xml
   <settings pass="generalize">
     <component name="Microsoft-Windows-PnpSysprep" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
       <PersistAllDeviceInstalls>true</PersistAllDeviceInstalls>
     </component>
   </settings>
   ```

Why each setting is there: [Configuration files explained](#configuration-files-explained).

### A2. Make Sysprep's job possible

Sysprep refuses to generalize when a Store app was updated for one user but not provisioned for
all users. Remove the user copies of such apps; the provisioned versions stay and are installed for
new users.

- **Servers** (only Edge on 2022 and 2025; Server 2016 and 2019 have none):

  ```powershell
  Get-AppxPackage -AllUsers *MicrosoftEdge.Stable* | Remove-AppxPackage -AllUsers
  ```

- **Windows 10 and 11**, where many apps update themselves: remove every package that is installed
  but not provisioned (frameworks other apps need refuse to go, which is fine):

  ```powershell
  $provisioned = (Get-AppxProvisionedPackage -Online).PackageName
  Get-AppxPackage -AllUsers |
      Where-Object { -not $_.NonRemovable -and $provisioned -notcontains $_.PackageFullName } |
      ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName -AllUsers -ErrorAction SilentlyContinue }
  ```

If Sysprep still stops, `C:\Windows\System32\Sysprep\Panther\setuperr.log` names the package.

### A3. Shrink

Every GB still used on the template disk is copied for every new server (full clone):

```powershell
# Superseded update files (afterwards installed updates can no longer be uninstalled)
Dism.exe /Online /Cleanup-Image /StartComponentCleanup /ResetBase
# Temporary files and the update download cache
Remove-Item "$env:TEMP\*", 'C:\Windows\Temp\*' -Recurse -Force -ErrorAction SilentlyContinue
Stop-Service wuauserv; Remove-Item 'C:\Windows\SoftwareDistribution\Download\*' -Recurse -Force -ErrorAction SilentlyContinue
# Tell the storage which blocks are free (needs Discard on the disk)
Optimize-Volume -DriveLetter C -ReTrim -Verbose
```

### A4. Generalize

Back in the Cloudbase-Init installer, tick **Run Sysprep to create a generalized image** and
**Shutdown when Sysprep terminates**, and click *Finish*. (Without the installer, run the command
from [Updating a template](#updating-a-template).) The VM generalizes itself and shuts down. On
Windows 10 and 11 this also ends audit mode.

**Do not start it again**: its first boot would run the specialize pass and OOBE, and the template
would no longer be generalized. Continue with [Turn the VM into a template](#turn-the-vm-into-a-template).

## Way B: without Sysprep

Not for Windows Server 2025 or Windows 11 (see [the comparison](#making-clones-unique-with-or-without-sysprep)).

### B1. Configure Cloudbase-Init

Without the specialize pass, the **service** does everything on the clone's first boot: password,
network, `C:` extension, the local script, and the computer name. Windows applies a new computer
name only with a restart, so the plugin that sets it (`UserDataPlugin`) goes **last** and the service
may restart (`allow_reboot=true`); after the restart the plugins already done are skipped and the
service stops.

Replace `cloudbase-init.conf` with:

```ini
[DEFAULT]
username=Administrator
groups=Administrators
inject_user_password=true
first_logon_behaviour=no
metadata_services=cloudbaseinit.metadata.services.configdrive.ConfigDriveService
check_latest_version=false
mtu_use_dhcp_config=false
ntp_use_dhcp_config=false
log_dir=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\log\
log_file=cloudbase-init.log
local_scripts_path=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\LocalScripts\
plugins=cloudbaseinit.plugins.common.setuserpassword.SetUserPasswordPlugin,cloudbaseinit.plugins.common.networkconfig.NetworkConfigPlugin,cloudbaseinit.plugins.windows.extendvolumes.ExtendVolumesPlugin,cloudbaseinit.plugins.common.sshpublickeys.SetUserSSHPublicKeysPlugin,cloudbaseinit.plugins.common.localscripts.LocalScriptsPlugin,cloudbaseinit.plugins.common.userdata.UserDataPlugin
allow_reboot=true
stop_service_on_exit=true

[config_drive]
types=iso
locations=cdrom
```

`cloudbase-init-unattend.conf` and `Unattend.xml` are not used on this way; leave them as they are.

Keep the `cloudbase-init` service's startup type **Automatic**, not *Automatic (Delayed Start)*: the
panel waits until the service has recorded its plugins for the new server, so a service that starts
late only makes every server ready later.

### B2. Remove what must differ per server

**Windows 10:** the template must not keep the temporary account of step 3. Enable the built-in
Administrator, give it a password, sign out, sign in as `Administrator` and remove the other
account:

```powershell
Get-LocalUser | Where-Object { $_.SID -like '*-500' } | Enable-LocalUser
net user Administrator *          # asks for a temporary password
# sign out, sign in as Administrator, then:
Remove-LocalUser -Name setup      # its profile folder under C:\Users can be deleted too
```

**All versions:** these are the values Sysprep would have reset that matter for a server. In
PowerShell as Administrator:

```powershell
# Remote Desktop certificate: Windows creates a new one when the service starts on a clone
Remove-Item -Path 'Cert:\LocalMachine\Remote Desktop\*' -Force
# Windows Update client ID: WSUS and update reports would see every server as one
Stop-Service wuauserv
Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate' -Name SusClientId, SusClientIdValidation -ErrorAction SilentlyContinue
# Cloudbase-Init's memory of instances it has seen, and its logs
Remove-Item 'HKLM:\SOFTWARE\Cloudbase Solutions\Cloudbase-Init\*' -Recurse -ErrorAction SilentlyContinue
Remove-Item 'C:\Program Files\Cloudbase Solutions\Cloudbase-Init\log\*' -ErrorAction SilentlyContinue
# Event logs of the build
wevtutil el | ForEach-Object { wevtutil cl "$_" 2>$null }
```

What stays shared and cannot be fixed without Sysprep: the machine SID and the KMS client machine
ID.

The template's Administrator password stays on the clone until Cloudbase-Init replaces it, which is
why `SetUserPasswordPlugin` runs before the network is configured. Still use a long random password
for the template.

### B3. Shrink and shut down

Run the commands of [A3](#a3-shrink) (no Store app step is needed: there is no Sysprep), then shut
the VM down normally (Fast Startup is off since step 4, so this is a real shutdown):

```powershell
Stop-Computer
```

**Do not start it again** before converting it: Cloudbase-Init and Windows would write new values
again, and B2 would have to be repeated. Continue with
[Turn the VM into a template](#turn-the-vm-into-a-template).

## Turn the VM into a template

With the VM stopped:

1. *Hardware*: remove **both** CD/DVD drives.
2. *Hardware → Add → CloudInit Drive*, on the same storage as the disk. Leave the *Cloud-Init* tab
   empty: the panel fills it in for every server. (Never add the drive while the VM can still boot
   as a template: Cloudbase-Init would apply it.)
3. *Options*: *Boot Order* only the disk (`scsi0`), *QEMU Guest Agent* enabled.
4. *More → Convert to template*.

On a cluster with **local** storage, the template is needed on every node that hosts servers (clone
it there with *Clone → Target node*, mode *Full clone*, and convert the clone). With **shared**
storage one is enough. A **linked clone** additionally needs the template on the very storage the
server's disk goes to.

## Add it to the panel and test it

1. If the panel's API token is limited to a resource pool, add the template to that pool
   (*Datacenter → Permissions → Pools → `<pool>` → Members*).
2. *Admin → Clusters*: run a sync.
3. *Admin → OS templates*: under *Operating systems* add the system with the type **Windows** (for
   example "Windows Server" with version 2022, or "Windows 11" with version 24H2), then add the OS
   template with that version and map the Proxmox template to it. The type **Windows** is what makes
   the panel treat its servers as Windows. Choose the *Clone method* (see
   [How fast](#how-fast-a-new-server-can-be-ready)). Give packages for it at least the template's
   disk size and, for Windows 11, 4 GiB of memory and 2 cores.
4. Tick the new version only for apps that work on it (*Admin → Apps → Choose systems*): the bundled
   Windows recipes were written for Windows Server.
5. Create **two** test servers and check:

| Check | Expected |
|---|---|
| The task's *wait for the guest agent* step | ends about when the console shows the logon screen (no OOBE question in between); the server becomes *Active* |
| **Remote Desktop** as `Administrator` with the password the panel shows | logs in; the template's password does not |
| `hostname`, `ipconfig`, `Get-Volume C` | the server's name, the panel's address, the package's disk size |
| Restarts: `Get-WinEvent -FilterHashtable @{LogName='System'; Id=1074} -MaxEvents 5 \| Format-List TimeCreated, Message` | Way A: one by `winlogon.exe`, none by Cloudbase-Init (`python.exe`). Way B: one by Cloudbase-Init for the computer name |
| Way A only: `whoami /user` on both servers | the part of the SID before the last `-` differs |
| Way B: the Remote Desktop certificate's thumbprint on both servers (`Get-ChildItem 'Cert:\LocalMachine\Remote Desktop'`) | differs |
| *Reset password* on the server page | the new password works over Remote Desktop |

## Configuration files explained

- **Plugins of the service.** The default `CreateUserPlugin` only set the password of the existing
  Administrator again and took 10 s; `SetUserPasswordPlugin` sets it from the metadata
  (`admin_pass`) in a fraction of a second. It needs the account to exist under the name
  `Administrator` ([step 5](#5-the-administrator-account)).
- **Password before network.** Until `SetUserPasswordPlugin` runs, the template's password is
  valid; running it before `NetworkConfigPlugin` means the server is not reachable on its address
  while that is so.
- **`LocalScriptsPlugin`** runs `enable-administrator.ps1` as SYSTEM: on Windows 10 and 11 the
  account Sysprep disabled is enabled before the panel considers the server ready (the service has
  not stopped yet).
- **`ExtendVolumesPlugin`** grows `C:` to the disk the panel created: in the specialize pass on
  Way A, in the service on Way B. Later disk upgrades are extended by the panel's `disk.ps1`.
- **`UserDataPlugin`** sets the computer name. Proxmox writes the hostname only into the user-data
  (`#cloud-config`, `hostname: …`); `meta_data.json` has none, so `SetHostNamePlugin` alone finds no
  name. Of Proxmox's user-data only `hostname` works on Windows; `user`, `password`, `chpasswd`,
  `fqdn`, `disable_root` and `manage_etc_hosts` are logged as *not supported*, so nothing is lost.
  Windows applies a name at the next restart: on Way A that is the restart of the specialize pass,
  on Way B the service's own restart, which is why it is the last plugin there.
- **`metadata_services`** with only `ConfigDriveService` keeps Cloudbase-Init from trying network
  metadata services (EC2, OpenStack HTTP), which only time out on Proxmox (about two minutes).
- **`[config_drive]`**: Proxmox's CloudInit drive is an ISO on a CD drive; `vfat` on `hdd` only logs
  *"mtools_path" needs to be provided*. These options replace the deprecated `config_drive_cdrom`,
  `config_drive_vfat` and `config_drive_raw_hdd`.
- **`allow_reboot`**: `false` in the unattend file, because a restart in the specialize pass breaks
  Sysprep; `true` in the service, which on Way B restarts for the computer name.
- **`stop_service_on_exit=true`**: the service stops when it is done; the panel waits for that,
  besides the plugins it recorded (a service that keeps running ends the wait only after 15 minutes).
- **`plugins`** is also what the panel reads to know when the service is done: every plugin listed
  in `cloudbase-init.conf` must be recorded for the server's instance ID. Keep the line on one
  line; without it the panel accepts any plugin recorded besides those of
  `cloudbase-init-unattend.conf`, which the specialize pass records under the same instance ID.
- **`WillReboot` `Never` and `& exit 0`** (Way A): Cloudbase-Init's own `Unattend.xml` ends with
  `&& exit 1 || exit 2` and `OnRequest`, and exit code 1 asks Windows setup for an extra restart even
  when Cloudbase-Init succeeded. A failed run in the specialize pass is then no longer repeated; only
  the computer name is skipped (password and network come from the service). Its log is
  `cloudbase-init-unattend.log`.
- **The `oobeSystem` pass for Windows 10 and 11** (Way A): Windows Server's OOBE needs no answer
  once a password is known, the client's asks for region, keyboard, network, an account and privacy
  settings. Each `Hide…` setting removes one screen, `ProtectYourPC` 3 answers the privacy screen
  with the most restrictive choice.
- **`PersistAllDeviceInstalls`** (optional, Way A) keeps the devices of the template, which match
  every clone as long as its virtual hardware is not changed, and should shorten "Getting ready"
  (*not measured yet*). Core count, memory size and MAC address are not hardware differences in
  this sense; a different disk bus or network model is.
- Scripts in **`LocalScripts\`** run at the first boot and delay everything after them; the log
  shows how long each took (`Script "…" ended with exit code`). Avoid fixed waits there.

## How fast a new server can be ready

Measured on Windows Server 2022, 2 vCPU, 4 GiB, LVM-thin (2026-10-20), Way A:

| Phase | Time | What decides it |
|---|---|---|
| Full clone of the template | 2:00 | Used size of the template disk and storage speed. A **linked clone** takes seconds |
| First boot: specialize pass ("Getting ready"), then the one restart | 1:01 | vCPUs; device installation |
| Second boot until OOBE is done | 0:20 | vCPUs |
| Cloudbase-Init service (network, password) | 0:26 | 10 s of it was `CreateUserPlugin`, which this guide removes (not measured since) |
| Panel notices that setup has finished | a few seconds | It checks every 5 s |

Other versions have not been measured. Expect Windows 10 and 11 to take longer: a larger template
(Windows 11 starts at 64 GiB) makes the full clone slower, and their OOBE does more. Way B skips the
specialize pass and OOBE (about 1:20 of the above) but adds a restart for the computer name.

The levers, largest first:

1. **Clone method *Linked clone*** on the OS template ([ADR 0027](../adr/0027-linked-clones.md)):
   about 2 minutes less. Servers then depend on the template; read the ADR first.
2. **A small template** (A3): a full clone copies only the used blocks of a thin disk.
3. **More vCPUs** in the package: the setup passes are mostly CPU work.
4. **Way B** instead of Way A, where the version allows it and with its costs.
5. **No restart beyond the necessary one** and **no unneeded Cloudbase-Init plugins**.

## Updating a template

Refresh the template monthly for security updates.

**Way A:**

1. *Clone* the template (mode **Full clone**), start the clone and log in on the console. It runs
   its first-boot setup once.
2. Install the updates and restart until none is pending, then run A2 and A3.
3. Generalize it with Cloudbase-Init's answer file and let it shut down:

   ```bat
   C:\Windows\System32\Sysprep\sysprep.exe /generalize /oobe /shutdown /unattend:"C:\Program Files\Cloudbase Solutions\Cloudbase-Init\conf\Unattend.xml"
   ```

**Way B:**

1. *Clone* the template (mode **Full clone**). In the clone's *Cloud-Init* tab set a temporary
   *Password*, start it and log in on the console (Cloudbase-Init applies the password and restarts
   once for the name).
2. Install the updates and restart until none is pending, then run B2 (the part for all versions)
   and B3.

**Both:** do [Turn the VM into a template](#turn-the-vm-into-a-template) with a new dated name, sync
the cluster and map the OS template to the new template. Delete the old template once nothing uses
it. Full clones do not depend on it; while **linked clones** use its base disk, Proxmox refuses to
delete it, so keep it until those servers are reinstalled or terminated.

## What the panel does for Windows

The operating system's type **Windows** makes the OS template's platform `windows`, for servers and
client versions alike. The platform decides:

| Operation | How it works on Windows |
|---|---|
| First boot | The config drive carries the password (`admin_pass`), the network settings and the hostname (in the user-data). Cloudbase-Init applies them |
| Additional IP addresses, primary address | The default `addresses.ps1` guest script (ADR 0010, 0011), run through the QEMU guest agent. It registers a **scheduled task "Proxmotion addresses"** that applies the addresses again at every startup |
| Disk grown by an upgrade | The default `disk.ps1` extends the `C:` partition |
| Password reset | The guest agent sets the password of **`Administrator`** (or the template's own `password_reset` script) |
| Hostname change | The default `hostname.ps1` renames the computer to the first label of the hostname (at most 15 characters). Windows applies it at the next restart: the panel restarts the server when asked, otherwise it shows *restart required* (ADR 0012) |
| Apps | Windows apps only (IIS, SQL Server Express, Chocolatey and recipes with `platform: windows`), run by `run.ps1` as a **scheduled task under `\Proxmotion\`** as SYSTEM (ADR 0029). Windows PowerShell 5.1 is needed |

Scripts can be replaced per template under *OS templates → Scripts*.

**When a new server is ready.** The guest agent already answers during the specialize pass, long
before Windows is usable. So for a new or reinstalled Windows server the task's *wait for the guest
agent* step goes on, checking through the agent every few seconds, until

- `ImageState` under `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Setup\State` is
  `IMAGE_STATE_COMPLETE` (on Way B it already is; a template without the value counts as complete),
- no new computer name waits for a restart (`ComputerName` and `ActiveComputerName` under
  `HKLM\SYSTEM\CurrentControlSet\Control\ComputerName` are the same),
- the `cloudbase-init` service is no longer running (`Stopped`, or not installed),
- Cloudbase-Init has not asked for a restart since the last boot (an event 1074 of its process in
  the System log, as when a local script exits with 1003), and
- Cloudbase-Init has recorded every plugin of the service's configuration (the `plugins` line of the
  `cloudbase-init.conf` its service runs with) under
  `HKLM\SOFTWARE\Cloudbase Solutions\Cloudbase-Init\<instance ID>\Plugins`, where the instance ID is
  the `uuid` of `openstack\latest\meta_data.json` on the config drive: as done (`1`), or as to run
  again at the next boot (`2`), which plugins that run at every boot (`ExtendVolumesPlugin`,
  `LocalScriptsPlugin`, `MTUPlugin`) always record. Plugins of the specialize pass are recorded
  there too but do not count.

A stopped service alone is not enough: it looks the same before it has started and between the
end of its run and the restart it asked for, while the new computer name is not in use yet. Checks
from inside that ran at such a moment (Server 2022 51 seconds after the start, Windows 10 after about four minutes) reported a
`WIN-…` or `DESKTOP-…` name and a `C:` not yet extended, though the server had its name later.

Restarts in between are waited out. Only then is the server *Active* and do the address script and
the template's own script run. When the agent has not answered at all after 10 minutes (a template
without an agent), the step ends with that note as on Linux; when setup has not finished after 15
minutes, the step notes *Windows setup did not finish within 15 minutes* with what the last check
still waited for (for example *Cloudbase-Init has not finished NetworkConfigPlugin*: a plugin that
failed is never recorded; see `cloudbase-init.log`) and the task goes on.
Should a restart still interrupt a script, the panel waits for the agent and runs the script again
(up to three times), and the Windows scripts wait for Cloudbase-Init before they touch the network.

**Why a Way A server restarts once.** Windows setup always ends the specialize pass with a restart
before OOBE (`C:\Windows\Panther\UnattendGC\setupact.log`: *Reboot required after setup.exe and
PostSysprep commands, before launching OOBE*). Cloudbase-Init's defaults add two more, which the
configuration of A1 removes:

| Restart | Cause | Fix |
|---|---|---|
| Cloudbase-Init's service (`python.exe` in event 1074) | `UserDataPlugin` in the service sets the name and restarts (`allow_reboot=true`) | Run `UserDataPlugin` in the specialize pass |
| `winlogon.exe` in the middle of the specialize pass (`Unattend action requested immediate reboot and recall` in `C:\Windows\Panther\setupact.log`) | `<WillReboot>OnRequest</WillReboot>` and `&& exit 1 \|\| exit 2` in `Unattend.xml` | `<WillReboot>Never</WillReboot>` and `& exit 0` |

## Troubleshooting

| What you see | What it means / what to do |
|---|---|
| Windows 11 setup: *This PC can't run Windows 11* | No TPM 2.0, Secure Boot off (EFI disk without pre-enrolled keys), less than 4 GiB, 64 GiB or 2 cores, or a CPU type without x86-64-v2 |
| Server 2025 or Windows 11 does not boot, or stops early | CPU type `kvm64`/`qemu64`: use the default `x86-64-v2-AES` |
| Windows 10/11: a new server stops at an OOBE screen in the console | The `oobeSystem` pass of A1 is missing or incomplete; the screen shown tells which setting is missing |
| Remote Desktop does not connect | Remote Desktop is off by default: step 4. Windows Home has no Remote Desktop host. Also check that the panel's address is set (`ipconfig`) |
| Remote Desktop: the password is refused for `Administrator` | The account is disabled (Windows 10/11, step 5: the local script) or has a localized name |
| Password not set (`cloudbase-init.log` has no `Using admin_pass metadata user password`) | The VM needs a CloudInit drive and its OS type must be Windows; the account must be called `Administrator` |
| Way A: two restarts, both `winlogon.exe` | `Unattend.xml` still asks for a restart after Cloudbase-Init: A1 |
| Way A: a restart by `python.exe` (Cloudbase-Init) | `UserDataPlugin` is in `cloudbase-init.conf` instead of `cloudbase-init-unattend.conf` |
| Sysprep stops: *Package … was installed for a user, but not provisioned for all users* | A2; `C:\Windows\System32\Sysprep\Panther\setuperr.log` names the package |
| Sysprep stops on Windows 10/11 because of BitLocker | Device encryption is on: step 4 |
| Way B: the computer name stays the template's | `UserDataPlugin` is missing, or `allow_reboot=false`: B1. `cloudbase-init.log` shows `Changing hostname` |
| Way B: the template's password works on a new server | `SetUserPasswordPlugin` did not run: Cloudbase-Init believes it already handled this instance (registry not cleared in B2) or the VM's OS type is not Windows |
| Way B: Remote Desktop warns about the same certificate on every server | The certificate was not deleted in B2 |
| Way B: every server takes a while longer to become *Active* | The service starts late (delayed start): B1 |
| "Getting ready" takes long, *Working on updates* | Updates were still pending in the template |
| Hostname still `WIN-…` or `DESKTOP-…` (Way A) | `cloudbase-init-unattend.log` should show `Changing hostname` |
| The task takes 15 minutes and notes *Windows setup did not finish* | The note says what the last check waited for. *the cloudbase-init service is Running*: `stop_service_on_exit=true` missing. *Cloudbase-Init has not finished …*: those plugins failed (`cloudbase-init.log`), or the config drive has no `config-2` label. *Cloudbase-Init has not run for this server yet*: the template has no `plugins` line and the service recorded nothing. *Windows setup reports …*: setup hangs, see the console |
| *The additional addresses could not be configured inside the server: QEMU guest agent is not running* | Windows restarted while the script ran, three times. The scheduled task applies the addresses at the next startup; or *Run on server* on the Scripts page |
| *Get-NetAdapter : Critical error* | Windows was still in its setup; current scripts wait for that. Update the template's override if it replaced the default |

Where the time of a new server went (PowerShell as Administrator, on the new server):

```powershell
Get-WinEvent -FilterHashtable @{LogName='System'; Id=12} -MaxEvents 3 | Format-Table TimeCreated
Get-WinEvent -FilterHashtable @{LogName='System'; Id=1074} -MaxEvents 5 | Format-List TimeCreated, Message
Get-Content 'C:\Program Files\Cloudbase Solutions\Cloudbase-Init\log\cloudbase-init*.log' | Select-String 'Executing plugin|Plugins execution done|ended with|Rebooting'
Select-String -Path C:\Windows\Panther\UnattendGC\setupact.log -Pattern 'ImageState'
```

Event 12 is each boot, 1074 each restart and who asked for it, the Cloudbase-Init lines show how long
each plugin took, and `ImageState` when setup finished.

## Not verified yet

- **Only Windows Server 2022 with Way A has been used with the panel** (2026-10-20): a single
  restart with the `Unattend.xml` change, and the server *Active* a few seconds after the
  Cloudbase-Init service stopped. Not tried: Server 2016, 2019 and 2025, Windows 10 and 11, Way B,
  the plugin order with the password first, the local script enabling Administrator.
- **Windows 10 and 11 in particular:** that audit mode plus the `oobeSystem` pass of A1 leaves no
  OOBE screen, that `AdministratorPassword` with `HideLocalAccountScreen` creates no extra account,
  that the Store package removal of A2 is enough for Sysprep, the TPM state in linked clones, and the
  bundled Windows app recipes on client versions.
- **The readiness check since 2026-10-27:** the plugin states under the instance ID read from the
  config drive, the `--config-file` of the service's command line, and `ActiveComputerName` until
  the restart (the check before only looked at the service, which looked stopped too early on Server
  2022 and Windows 10). Taken from Cloudbase-Init's source and tried on sample values only.
- **Way B:** the computer name set by the service with its restart, the deletion of the Remote
  Desktop certificate and the Windows Update client ID, and clearing Cloudbase-Init's registry key.
  The authentication failures between machines with the same SID are taken from Microsoft's release
  notes, not tried by us.
- The lifecycle dates and the QMTH licensing note are from Microsoft's public documents; check them
  before you rely on them.
- Not measured: `PersistAllDeviceInstalls`, the service without `CreateUserPlugin`, the shrinking
  commands, linked clones of a Windows template.
- Windows apps (ADR 0029) have only run against the panel's fake Proxmox. The Windows default scripts
  ran on one Windows Server image (2026-10-17): additional addresses after a reinstall.
