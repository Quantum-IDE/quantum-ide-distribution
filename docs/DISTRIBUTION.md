# Quantum IDE — Distribution Infrastructure & Architecture

This repository (`quantum-ide-distribution`) serves as the official, public distribution portal and release metadata service for **Quantum IDE**.

It is engineered with a strict boundary of isolation from the core, private Quantum IDE source codebase.

---

## 1. Architectural Isolation Principle

```
+-------------------------------------------------------------+
|               Private Quantum Development Core              |
|   (Source code, proprietary agents, runtime internals)       |
|                            |                                |
|                   [ External Build Host ]                   |
|                            | (Builds Signed Installer)       |
+----------------------------v--------------------------------+
                             |
                   Deliverable Installer (.exe)
                             |
+----------------------------v--------------------------------+
|       Public Distribution Center (This Repository)          |
|                                                             |
|  - Release Manifests (channels/*)                           |
|  - Official Download Portal (GitHub Pages)                  |
|  - GitHub Releases (Binaries + SHA-256 Checksums)           |
|  - Client Update Feeds                                      |
+-------------------------------------------------------------+
```

### Non-Negotiable Boundaries
1. **Zero Source Code**: No proprietary Quantum IDE engine source, models, internal agents, or developer credentials exist in or transit through this repository.
2. **Artifact-Only Ingestion**: This repository receives only finalized, externally built installer artifacts (e.g. `Quantum-Setup-*.exe`).
3. **Decoupled Permissions**: Workflows in this repository operate under minimal GitHub Pages deployment scopes (`pages: write`, `id-token: write`). They hold no permissions or access tokens to private upstream repositories.

---

## 2. Release Manifest Specification

Clients query channel manifests to check for updates dynamically.

Path convention:
```
channels/<channel>/<platform>-<architecture>.json
```

Example: `channels/friends-beta/windows-x64.json`

### Field Definitions

| Field | Type | Description |
| :--- | :--- | :--- |
| `schemaVersion` | `string` | Manifest specification version (`1.0.0`) |
| `product` | `string` | Always `"Quantum IDE"` |
| `platform` | `string` | Target OS: `"windows"`, `"linux"`, or `"darwin"` |
| `architecture` | `string` | CPU architecture: `"x64"` or `"arm64"` |
| `channel` | `string` | Distribution stream: `"friends-beta"`, `"canary"`, `"stable"` |
| `version` | `string\|null` | Semver tag (e.g., `"v0.1.0-beta.1"`) |
| `updateClass` | `string` | Update policy: `"silent-next-launch"` or `"manual-consent"` |
| `publishedAt` | `string\|null` | ISO 8601 UTC timestamp of release |
| `available` | `boolean` | `true` only when a verified installer is live |
| `downloadUrl` | `string\|null` | Direct HTTPS URL to binary installer on GitHub Releases |
| `fileName` | `string\|null` | Installer filename (e.g., `Quantum-Setup-0.1.0-beta.1-x64.exe`) |
| `sizeBytes` | `integer\|null`| Exact file size in bytes |
| `sha256` | `string\|null` | 64-character lowercase hexadecimal SHA-256 digest |
| `releaseNotesUrl` | `string\|null`| Public link to release notes on GitHub |
| `deltaSupport` | `object` | Delta/differential update settings |
| `minOSVersion` | `string` | Minimum required OS level |

---

## 3. Dual Update Classification Strategy

Quantum IDE does not determine update urgency from the version number alone. Instead, the `updateClass` explicitly dictates the client's presentation and installation behavior.

### A. Silent Updates (`silent-next-launch`)
* **Intended Use**: Hotfixes, minor bug patches, minor security mitigations, and performance adjustments that do not alter the user workflow.
* **Client Behavior**:
  1. Quantum IDE background daemon polls the channel manifest.
  2. Detects a new version with `updateClass: "silent-next-launch"`.
  3. Downloads and verifies payload silently in the background (or applies delta patch).
  4. Stages payload in local staging directory.
  5. Automatically swaps the binary upon next application start without interrupting active sessions or requiring manual clicks.

### B. Manual Consent Updates (`manual-consent`)
* **Intended Use**: Major feature releases, significant UI changes, new AI models/integrations, and architecture migrations.
* **Client Behavior**:
  1. Client detects manifest change.
  2. Notifies user via a non-intrusive notification badge.
  3. Shows release highlights, features, and migration warnings.
  4. Waits for explicit user consent before proceeding.
  5. Never forcibly restarts or updates without authorization.

---

## 4. Delta / Differential Updates Strategy

To minimize bandwidth consumption, the distribution infrastructure provides architectural hooks for differential patching:

- **Blockmap Metadata**: For installers built via electron-builder or Squirrel, a corresponding `.blockmap` file is published alongside the installer.
- **Differential Calculation**: Quantum client updater downloads only the changed chunks across versions.
- **Graceful Fallback**: If blockmap verification fails or chunk range requests return HTTP errors, the client falls back to `downloadUrl` for a full, safe installer download.

---

## 5. Publishing a New Release

To publish a newly built installer, maintainers use the automated publishing tool:

### Using PowerShell (Windows):
```powershell
.\scripts\publish-release.ps1 `
    -InstallerPath "C:\Builds\Quantum-Setup-0.1.0-beta.1-x64.exe" `
    -Version "v0.1.0-beta.1" `
    -UpdateClass "manual-consent"
```

### Using Bash (Linux / WSL):
```bash
./scripts/publish-release.sh \
    -f "/path/to/Quantum-Setup-0.1.0-beta.1-x64.exe" \
    -v "v0.1.0-beta.1" \
    -c "manual-consent"
```

The script automatically:
1. Validates the binary file.
2. Computes the SHA-256 checksum.
3. Generates the `.sha256` checksum asset.
4. Creates the GitHub Release with pre-release tagging.
5. Uploads both assets to GitHub Releases.
6. Updates `channels/friends-beta/windows-x64.json`.
7. Commits and pushes the manifest to trigger GitHub Pages redeployment.
