# Quantum IDE — Official Release Publishing Process

This document defines the standard operating procedure for publishing and distributing official releases of **Quantum IDE** to the public distribution infrastructure.

---

## 1. Prerequisites for Maintainers

Before publishing any release, ensure the following tools are configured on the release workstation:

1. **GitHub CLI (`gh`)**:
   - Must be installed and authenticated to the official organization/account: `Quantum-IDE`.
   - Verify active session:
     ```bash
     gh auth status
     ```
   - Minimal required scopes: `repo`, `workflow`.

2. **Git**:
   - Clean working copy of `Quantum-IDE/quantum-ide-distribution`.
   - Connected via SSH or HTTPS credentials authorized for push access to `main`.

3. **Node.js**:
   - Node.js (v18+ or v20+ LTS) for executing `scripts/verify-manifest.js`.

---

## 2. Pre-Release Security & Integrity Checklist

Never publish an installer without completing this checklist:

- [ ] **Zero Source Code**: Verify that the deliverable contains only compiled, packaged binaries (e.g., `Quantum-Setup-0.1.0-beta.1-x64.exe`). No proprietary source files or test keys are bundled.
- [ ] **Virus & Malware Scan**: Run an automated scan (e.g. Windows Defender, VirusTotal API) on the installer executable.
- [ ] **Authenticode Digital Signature**: Ensure the binary is signed with a valid digital code signing certificate (see [UPDATE-ARCHITECTURE.md](./UPDATE-ARCHITECTURE.md)).
- [ ] **Semantic Versioning**: Tag matches `v<Major>.<Minor>.<Patch>[-<channel>.<build>]` (e.g. `v0.1.0-beta.1`).
- [ ] **Update Classification**: Correctly identify update class:
  - `manual-consent`: User prompt required (new features, UI redesign, major updates).
  - `silent-next-launch`: Background staging and silent application on next launch (hotfixes, bug patches).

---

## 3. Dry-Run Verification

Always perform a dry-run test first to validate the installer, calculate the checksum, and test manifest schema validation without publishing anything publicly:

### On Windows (PowerShell):
```powershell
.\scripts\publish-release.ps1 `
    -InstallerPath "C:\Builds\Quantum-Setup-0.1.0-beta.1-x64.exe" `
    -Version "v0.1.0-beta.1" `
    -UpdateClass "manual-consent" `
    -DryRun
```

### On Linux / WSL (Bash):
```bash
./scripts/publish-release.sh \
    -f "/path/to/Quantum-Setup-0.1.0-beta.1-x64.exe" \
    -v "v0.1.0-beta.1" \
    -c "manual-consent" \
    -d
```

The script will:
1. Verify installer existence and size.
2. Calculate the lowercase 64-character SHA-256 digest.
3. Validate simulated manifest changes against `schemas/release-manifest.schema.json`.
4. Run `node scripts/verify-manifest.js` to ensure zero breaking schema violations.
5. Restore local files to pristine state upon completion.

---

## 4. Live Release Publication

When the dry run passes, execute the publishing command in live mode:

### Windows (PowerShell):
```powershell
.\scripts\publish-release.ps1 `
    -InstallerPath "C:\Builds\Quantum-Setup-0.1.0-beta.1-x64.exe" `
    -Version "v0.1.0-beta.1" `
    -UpdateClass "manual-consent"
```

### If Differential Blockmaps Are Available:
```powershell
.\scripts\publish-release.ps1 `
    -InstallerPath "C:\Builds\Quantum-Setup-0.1.0-beta.1-x64.exe" `
    -BlockmapPath "C:\Builds\Quantum-Setup-0.1.0-beta.1-x64.exe.blockmap" `
    -Version "v0.1.0-beta.1" `
    -UpdateClass "silent-next-launch"
```

The tool handles the complete end-to-end pipeline:
1. Calculates cryptographic digest and saves `.sha256` asset.
2. Creates the GitHub Release tagged `v0.1.0-beta.1` marked as Pre-Release.
3. Uploads the executable, SHA-256 digest, and optional blockmaps to GitHub Releases.
4. Verifies uploaded assets exist in GitHub Releases via GitHub API.
5. Updates `channels/friends-beta/windows-x64.json` with live URLs and hashes.
6. Runs `scripts/verify-manifest.js` before committing.
7. Commits and pushes the manifest to `main`.
8. GitHub Actions (`.github/workflows/pages.yml`) validates and redeploys the landing page within ~45 seconds.

---

## 5. Post-Publication Verification Protocol

After publishing, verify live status:

1. **Verify Live Manifest**:
   ```bash
   curl -s https://quantum-ide.github.io/quantum-ide-distribution/channels/friends-beta/windows-x64.json
   ```
   Confirm `available` is `true`, `sha256` matches local build, and `downloadUrl` returns HTTP 200/302.

2. **Verify Download Landing Page**:
   Open:
   ```
   https://quantum-ide.github.io/quantum-ide-distribution/
   ```
   - Ensure the "Download installer" button is active (blue glow).
   - Verify displayed version matches `v0.1.0-beta.1`.
   - Verify SHA-256 hash matches and the copy button copies the exact hash.
   - Click download button to confirm browser initiates installer download from GitHub Releases.

---

## 6. Emergency Rollback Protocol

If a critical flaw is discovered after publishing:

1. Edit `channels/friends-beta/windows-x64.json`:
   - Set `"available": false`
   - Set `"downloadUrl": null`
2. Commit and push:
   ```bash
   git commit -am "hotfix: disable faulty installer distribution for windows-x64"
   git push origin main
   ```
3. The landing page immediately disables the download button and clients stop pulling the update.
