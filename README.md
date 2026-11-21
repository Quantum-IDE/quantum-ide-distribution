# Quantum IDE — Official Distribution Portal

Official public repository for **Quantum IDE** downloads, release manifests, and distribution infrastructure.

🌐 **Live Download Portal:** [https://quantum-ide.github.io/quantum-ide-distribution/](https://quantum-ide.github.io/quantum-ide-distribution/)

---

## 🚀 Release Channels

| Channel | Platform | Architecture | Status | Manifest |
| :--- | :--- | :--- | :--- | :--- |
| **Friends Beta** | Windows | x64 | Active | [`channels/friends-beta/windows-x64.json`](./channels/friends-beta/windows-x64.json) |
| **Friends Beta** | Linux | x64 | In Development | [`channels/friends-beta/linux-x64.json`](./channels/friends-beta/linux-x64.json) |
| **Friends Beta** | macOS | arm64 (Apple Silicon) | In Development | [`channels/friends-beta/darwin-arm64.json`](./channels/friends-beta/darwin-arm64.json) |

---

## 📦 Architecture & Security

- **Complete Repository Isolation:** This distribution repository contains zero application source code from the private Quantum IDE engine.
- **Dynamic Manifests:** The landing page dynamically loads releases via JSON feeds without requiring manual HTML alterations.
- **Cryptographic Verification:** Every release includes SHA-256 digests displayed in the UI and downloadable as `.sha256` files.
- **Dual Update Classes:** Differentiates `silent-next-launch` (background patches) from `manual-consent` (feature releases).
- **Delta Updates Ready:** Manifest schema supports blockmaps (`.blockmap`) for differential chunk patching.

For complete architectural details, see [docs/DISTRIBUTION.md](./docs/DISTRIBUTION.md) and [docs/UPDATE-ARCHITECTURE.md](./docs/UPDATE-ARCHITECTURE.md).

---

## 🛠️ Maintainer Guide: Publishing a Release

Maintainers can use the automated publisher script with the path to the built installer artifact.

### Dry-Run Verification (Recommended First):
```powershell
.\scripts\publish-release.ps1 -InstallerPath "C:\Builds\Quantum-Setup-0.1.0-beta.1-x64.exe" -Version "v0.1.0-beta.1" -DryRun
```

### Windows (PowerShell):
```powershell
.\scripts\publish-release.ps1 -InstallerPath "C:\Builds\Quantum-Setup-0.1.0-beta.1-x64.exe" -Version "v0.1.0-beta.1"
```

### Linux / WSL (Bash):
```bash
./scripts/publish-release.sh -f "/path/to/Quantum-Setup-0.1.0-beta.1-x64.exe" -v "v0.1.0-beta.1"
```

For full release procedures and emergency rollback protocols, consult the [Release Process Guide](./docs/RELEASE-PROCESS.md).

---

## 📄 License
This distribution portal and its scripts are provided under the MIT License.
Quantum IDE itself is proprietary software distributed under its respective license.
