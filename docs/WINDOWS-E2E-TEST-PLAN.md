# Quantum Update Engine — Windows End-to-End Test Plan

> **Status:** Cannot be executed in WSL-only environment.
> This document describes the full E2E test procedure to be run on a real
> Windows 11 x64 machine with an installed Quantum IDE build.

---

## Prerequisites

| Item | Requirement |
|------|------------|
| OS | Windows 11 x64 (build 22000+) |
| Machine | Physical or VM with network access |
| Build A | Quantum IDE `0.1.0-beta.1` **buildRevision 1** installed (old bootstrap) |
| Build B | Quantum IDE `0.1.0-beta.1` **buildRevision 2** as `.exe` installer available |
| Manifest | `channels/friends-beta/windows-x64.json` updated to point to Build B |
| Signing | Build B manifest signed with **production private key** (not test key) |
| Server | HTTPS server or GitHub Pages serving the signed manifest |
| `updateUrl` | Configured in `product.json` to point to the manifest server |

---

## Test Scenarios

### T-1: Normal Update — Download, Verify, Apply

**Goal:** Confirm the full happy path works end-to-end.

**Steps:**
1. Install Build A on the Windows machine.
2. Launch Quantum IDE.
3. Open Developer Tools → Console and confirm:
   ```
   [QuantumManifestClient] Fetching manifest from: <updateUrl>
   [QuantumManifestClient] Manifest fetched and validated
   [QuantumSignatureVerifier] Signature VALID
   ```
4. Confirm the update notification appears in the UI.
5. Click **Restart to Update**.
6. Verify that after restart, `Help → About` shows `buildRevision: 2`.

**Expected:** Smooth update. No errors. Settings preserved.

---

### T-2: SHA-256 Mismatch — Download Rejected

**Goal:** Confirm a corrupted installer is rejected before execution.

**Steps:**
1. Serve a manifest where `sha256` field does NOT match the actual installer file.
2. Install Build A, launch Quantum IDE.
3. Wait for manifest fetch (or trigger manually via Command Palette).

**Expected:**
- Download proceeds but integrity check fails.
- Error logged: SHA-256 mismatch.
- `inno_updater.exe` is NOT executed.
- Application continues running on Build A.

---

### T-3: Invalid Signature — Manifest Rejected

**Goal:** Confirm a tampered or wrongly signed manifest is rejected.

**Steps:**
1. Serve a manifest signed with the **test key** (not the production key).
2. Use a production build of Quantum IDE (product mode = `production`).

**Expected:**
- Signature verification fails.
- Log: `[QuantumSignatureVerifier] REJECTING update (production mode requires valid signatures)`
- No download initiated.
- No UI update notification shown.

---

### T-4: Missing Signature — Manifest Rejected in Production

**Goal:** Confirm unsigned manifests are rejected.

**Steps:**
1. Serve a valid manifest with `available: true` but **no `signature` field**.
2. Use a production build.

**Expected:**
- Log: `[QuantumSignatureVerifier] REJECTING update (production mode requires signed manifests)`
- No update offered.

---

### T-5: Older Build Revision — No Downgrade

**Goal:** Confirm that a manifest with an equal or older `buildRevision` does NOT trigger update.

**Steps:**
1. Install Build B (`buildRevision: 2`).
2. Serve a valid, correctly signed manifest with `buildRevision: 1` (or same `buildRevision: 2`).

**Expected:**
- `isNewerBuild()` returns `false`.
- No update notification shown.
- Log: `[QuantumManifestClient] No update available (not a newer build)`

---

### T-6: Settings Preservation After Update

**Goal:** Confirm user settings survive the update cycle.

**Steps:**
1. Set custom keybindings, theme, and extensions before update.
2. Apply update from Build A to Build B via T-1 procedure.
3. After restart, verify all settings are intact.

**Expected:** Settings, extensions, and workspace state preserved.

---

### T-7: Rollback on `inno_updater` Failure

**Goal:** Confirm application stays usable if the updater process fails.

**Steps:**
1. Corrupt the downloaded installer file after SHA-256 verification passes
   (simulate by placing a 0-byte file at the temp path before `inno_updater` runs).
2. Trigger the update flow.

**Expected:**
- `inno_updater.exe` exits with non-zero code.
- Quantum IDE relaunches normally on Build A.
- No "broken" state left behind.

---

### T-8: 5-Minute Cache Respected

**Goal:** Confirm the client does not hammer the manifest server.

**Steps:**
1. Launch Quantum IDE and let it fetch the manifest once.
2. Within 5 minutes, trigger a manual check (if UI allows).

**Expected:**
- Second check is served from in-memory cache (no HTTP request).
- Log: `[QuantumManifestClient] Returning cached manifest`

---

## Honest Limitations

> **This test plan CANNOT be executed in the current WSL-only development environment.**
>
> Specific blockers:
> - `inno_updater.exe` is a Windows binary — cannot run under WSL.
> - Electron app cannot be launched in WSL without a display server.
> - Windows registry entries written by the installer are not accessible from WSL.
> - The Win32 update engine (`win32AutoUpdater.ts`) requires Windows APIs.
>
> **All signing and schema verification tests have been validated on the
> distribution side.** The Windows E2E cycle must be validated on a real
> Windows machine or Windows CI pipeline before the first production release.

---

## Automation Hooks (Future)

For CI integration on a Windows runner (e.g. GitHub Actions `windows-latest`):

```yaml
- name: Install Build A
  run: start /wait BuildA-Setup.exe /SILENT

- name: Run update E2E
  run: |
    # Start mock manifest server
    node scripts/mock-manifest-server.js &
    # Launch Quantum IDE in headless update check mode
    "C:\Program Files\Quantum IDE\quantum.exe" --check-update-only
    # Assert update was downloaded and applied
    quantum.exe --version | Select-String "buildRevision: 2"
```

---

*Document version: 1.0 | Branch: `quantum/update-engine-signing-schema` | Commit: `66dfd6c`*
