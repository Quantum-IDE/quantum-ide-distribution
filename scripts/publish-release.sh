#!/usr/bin/env bash
set -euo pipefail

# publish-release.sh — Quantum IDE Release Distribution Publisher (Bash/WSL/Linux)

REPO="moustafaelturbo30-cpu/quantum-ide-distribution"
UPDATE_CLASS="manual-consent"
VERSION=""
RELEASE_NOTES=""

usage() {
  echo "Usage: $0 -f <installer-path> [-v <version>] [-c <update-class: manual-consent|silent-next-launch>] [-n <notes-file>]"
  exit 1
}

INSTALLER_PATH=""

while getopts "f:v:c:n:h" opt; do
  case "$opt" in
    f) INSTALLER_PATH="$OPTARG" ;;
    v) VERSION="$OPTARG" ;;
    c) UPDATE_CLASS="$OPTARG" ;;
    n) RELEASE_NOTES="$OPTARG" ;;
    h) usage ;;
    *) usage ;;
  esac
done

if [[ -z "$INSTALLER_PATH" ]]; then
  echo "Error: -f <installer-path> is required."
  usage
fi

if [[ ! -f "$INSTALLER_PATH" ]]; then
  echo "Error: Installer file not found at $INSTALLER_PATH"
  exit 1
fi

FILE_NAME=$(basename "$INSTALLER_PATH")
FILE_SIZE=$(stat -c%s "$INSTALLER_PATH")

if [[ $FILE_SIZE -le 0 ]]; then
  echo "Error: Installer file is empty (0 bytes)."
  exit 1
fi

if [[ -z "$VERSION" ]]; then
  if [[ "$FILE_NAME" =~ ([0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?) ]]; then
    VERSION="v${BASH_REMATCH[1]}"
  else
    echo "Enter version tag (e.g. v0.1.0-beta.1):"
    read -r VERSION
  fi
fi

if [[ ! "$VERSION" =~ ^v ]]; then
  VERSION="v$VERSION"
fi

echo "=== Publishing Quantum IDE $VERSION to $REPO ==="
echo "Target File: $FILE_NAME ($FILE_SIZE bytes)"
echo "Update Class: $UPDATE_CLASS"

# Compute SHA-256
SHA256=$(sha256sum "$INSTALLER_PATH" | awk '{print $1}')
echo "SHA-256: $SHA256"
SHA_FILE="${INSTALLER_PATH}.sha256"
echo "$SHA256  $FILE_NAME" > "$SHA_FILE"

# Prepare notes
NOTES="## Quantum IDE Friends Beta ($VERSION)

### Release Details
- **Version:** $VERSION
- **Platform:** Windows x64
- **Channel:** Friends Beta
- **Update Classification:** $UPDATE_CLASS
- **Published:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")

### Verification & Checksum
- **Filename:** $FILE_NAME
- **Size:** $FILE_SIZE bytes
- **SHA-256:** \`$SHA256\`"

if [[ -n "$RELEASE_NOTES" && -f "$RELEASE_NOTES" ]]; then
  NOTES=$(cat "$RELEASE_NOTES")
fi

# Create GitHub Release
echo "[1/3] Creating GitHub Release..."
gh release create "$VERSION" "$INSTALLER_PATH" "$SHA_FILE" \
  --repo "$REPO" \
  --title "Quantum IDE $VERSION (Friends Beta)" \
  --notes "$NOTES" \
  --prerelease

# Update Manifest
echo "[2/3] Updating Manifest..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_ROOT/channels/friends-beta/windows-x64.json"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/$FILE_NAME"
NOTES_URL="https://github.com/$REPO/releases/tag/$VERSION"

node -e "
const fs = require('fs');
const file = '$MANIFEST';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
data.available = true;
data.version = '$VERSION';
data.updateClass = '$UPDATE_CLASS';
data.publishedAt = '$NOW';
data.downloadUrl = '$DOWNLOAD_URL';
data.fileName = '$FILE_NAME';
data.sizeBytes = $FILE_SIZE;
data.sha256 = '$SHA256';
data.releaseNotesUrl = '$NOTES_URL';
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
"

# Commit & Push
echo "[3/3] Committing and pushing manifest..."
cd "$REPO_ROOT"
git add channels/friends-beta/windows-x64.json
git commit -m "release(friends-beta): publish Quantum IDE $VERSION for windows-x64"
git push origin main

echo "=== Release $VERSION published successfully! ==="
echo "Download URL: $DOWNLOAD_URL"
echo "Portal: https://moustafaelturbo30-cpu.github.io/quantum-ide-distribution/"
