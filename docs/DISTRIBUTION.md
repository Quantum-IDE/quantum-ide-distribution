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

## 3. Related Documentation

- [Release Process Guide](./RELEASE-PROCESS.md): Step-by-step instructions for publishing releases with PowerShell and Bash.
- [Update Architecture & Philosophy](./UPDATE-ARCHITECTURE.md): Comprehensive guide on Silent vs Manual updates, Delta updating, and code signing.
- [JSON Schema Specification](../schemas/release-manifest.schema.json): Formal draft-07 JSON Schema for manifests.
