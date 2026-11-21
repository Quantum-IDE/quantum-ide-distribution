# Quantum IDE — Update Architecture & Philosophy

This document outlines the architectural specifications, update classification philosophy, delta patching system, and security requirements governing **Quantum IDE** distribution.

---

## 1. Dual Update Philosophy

Quantum IDE updates are categorized into two explicit update classes declared directly inside the channel manifest:

```json
{
  "updateClass": "silent-next-launch" | "manual-consent"
}
```

This classification decouples the update mechanism from raw semantic version numbers, allowing maintainers to dictate client behavior based on user impact.

```
+-------------------------------------------------------------+
|              Quantum IDE Channel Manifest Poll              |
+-------------------------------------------------------------+
                               |
               +---------------v---------------+
               | Check updateClass in manifest |
               +---------------+---------------+
                               |
              +----------------+----------------+
              |                                 |
   [ silent-next-launch ]               [ manual-consent ]
              |                                 |
    - Background download             - Badge notification
    - Zero user disruption            - Changelog & migration prompt
    - Staged in cache dir             - Require user approval
    - Applied on next launch          - Never auto-restart
```

### A. Silent Updates (`silent-next-launch`)
* **Use Cases**:
  - Critical bugfixes & security patches.
  - Performance improvements & memory leak fixes.
  - Minor UI styling alignments.
  - Non-breaking changes that require no user configuration changes.
* **Client Implementation Requirements (Future Quantum Client)**:
  1. Background thread periodically polls `channels/<channel>/<platform>-<arch>.json`.
  2. If new version detected with `silent-next-launch`, client initiates background chunk/delta download at low priority.
  3. Payload is verified against `sha256` and saved in `%LOCALAPPDATA%\Quantum-IDE\updates\staged\`.
  4. Upon normal application exit or restart, a lightweight launcher script swaps the executables.
  5. The user never sees an intrusive popup or forced restart during active coding sessions.

### B. Manual Consent Updates (`manual-consent`)
* **Use Cases**:
  - Major feature releases & new architectural components.
  - AI engine upgrades or breaking configuration schema changes.
  - Interface overhauls and new workflow additions.
* **Client Implementation Requirements (Future Quantum Client)**:
  1. Client detects `manual-consent` in the manifest.
  2. A notification pill or badge appears in the Quantum status bar.
  3. Clicking opens an Update Modal displaying release notes, feature highlights, and required migrations.
  4. User can choose **"Update Now"**, **"Update on Exit"**, or **"Postpone"**.
  5. The updater never proceeds without explicit authorization.

---

## 2. Delta / Differential Updates Architecture

Full installers for modern developer IDEs typically exceed 100–150 MB. Requiring complete downloads for small patch releases wastes network bandwidth and slows adoption.

### Delta Strategy Specification

Quantum distribution manifests include the `deltaSupport` object:

```json
"deltaSupport": {
  "enabled": true,
  "blockmapUrl": "https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/v0.1.0-beta.1/Quantum-Setup-0.1.0-beta.1-x64.exe.blockmap",
  "fallbackUrl": "https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/v0.1.0-beta.1/Quantum-Setup-0.1.0-beta.1-x64.exe"
}
```

### How Blockmaps Work
1. **Blockmap Generation**: During the build pipeline (via electron-builder or equivalent tooling), the binary installer is segmented into 64 KB compressed chunks. A `.blockmap` file records the SHA-256 hash and offset of each block.
2. **Client Comparison**: The local Quantum updater reads its installed files' blocks and downloads only the `.blockmap` of the target release (~50–100 KB).
3. **HTTP Range Requests**: The updater calculates the missing or modified blocks and issues HTTP multi-range `Range: bytes=start-end` requests to download only changed portions.
4. **Assembly & Verification**: The updater patches the installer locally and computes the final SHA-256 against `manifest.sha256`.
5. **Fail-Safe Fallback**: If blockmap download fails, byte-range requests fail, or the reconstructed file hash does not match, the updater immediately falls back to `fallbackUrl` (the full installer), ensuring zero broken installations.

---

## 3. Multi-Platform Roadmap

While Friends Beta is launched exclusively for **Windows x64**, the distribution architecture natively accommodates future platforms through identical manifest structures:

| Platform | Channel Manifest Path | Binary Asset Packaging | Target Status |
| :--- | :--- | :--- | :--- |
| **Windows x64** | `channels/friends-beta/windows-x64.json` | NSIS / InnoSetup `.exe` | **Active (Friends Beta)** |
| **Linux x64** | `channels/friends-beta/linux-x64.json` | AppImage, `.deb`, `.tar.gz` | In Development |
| **macOS arm64** | `channels/friends-beta/darwin-arm64.json` | Apple Silicon `.dmg` / `.zip` | In Development |

Each platform maintains its own isolated channel feed, enabling independent release pacing, platform-specific hotfixes, and distinct OS minimum requirements (`minOSVersion`).

---

## 4. Security & Cryptographic Integrity

### A. SHA-256 Verification
- Every published release produces an official lowercase 64-character SHA-256 digest.
- The checksum is verified:
  1. By maintainers during release compilation.
  2. By automated publishing scripts (`publish-release.ps1` / `publish-release.sh`).
  3. Displayed clearly on the landing page with a one-click copy button.
  4. Downloadable as an adjacent `<filename>.sha256` asset.
  5. Enforced by future client updaters prior to payload execution.

### B. Windows Authenticode Code Signing
Cryptographic hashing verifies download integrity (no bit-flips or man-in-the-middle tampering), but **Code Signing** proves publisher identity to the Windows OS:

1. **SmartScreen Behavior**:
   - Unsigned executables or self-signed certificates trigger Windows Defender SmartScreen ("Windows protected your PC / Unknown Publisher").
   - A commercial **Extended Validation (EV)** or **Organization Validation (OV)** code signing certificate from a Microsoft-trusted Certificate Authority (e.g. DigiCert, Sectigo) establishes trust and builds SmartScreen reputation.
2. **Maintainer Action Item**:
   - The distribution repository cannot forge code signing.
   - The binary must be signed during the external build process *before* delivering the artifact to `publish-release.ps1`.
   - In Friends Beta, maintainers may use a development certificate or provide clear instructions to testers for bypassing initial SmartScreen warnings during internal testing.

---

## 5. Scope Boundary

The distribution repository (`Quantum-IDE/quantum-ide-distribution`) manages:
- Public download site hosting (GitHub Pages).
- Release assets distribution (GitHub Releases).
- Release manifests feeds (`channels/*`).

**It does not contain or execute the in-IDE update client code.** That functionality is embedded inside the private Quantum IDE desktop application runtime.
