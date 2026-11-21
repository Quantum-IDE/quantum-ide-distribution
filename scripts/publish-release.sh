#!/usr/bin/env bash
set -euo pipefail

# publish-release.sh — Quantum IDE Release Distribution Publisher (Bash/WSL/Linux)

REPO="Quantum-IDE/quantum-ide-distribution"
UPDATE_CLASS="manual-consent"
VERSION=""
RELEASE_NOTES=""
BLOCKMAP_PATH=""
DELTA_PATH=""
DRY_RUN=false

usage() {
  cat << EOF
Usage: $0 -f <installer-path> [-v <version>] [-c <update-class>] [-n <notes-file>] [-b <blockmap-path>] [-r <repo>] [-d]

Options:
  -f <path>    Path to installer file (.exe, .msi, .zip) [Required]
  -v <version> Semantic version tag (e.g., v0.1.0-beta.1) [Auto-detected if omitted]
  -c <class>   Update classification: 'manual-consent' (default) or 'silent-next-launch'
  -n <path>    Path to markdown release notes file
  -b <path>    Path to differential .blockmap file (optional)
  -p <path>    Path to delta update package (optional)
  -r <repo>    GitHub repository [Default: Quantum-IDE/quantum-ide-distribution]
  -d           Dry run mode: validates file, hashes, and manifest without creating releases or pushing git
  -h           Show this help message
EOF
  exit 1
}

INSTALLER_PATH=""

while getopts "f:v:c:n:b:p:r:dh" opt; do
  case "$opt" in
    f) INSTALLER_PATH="$OPTARG" ;;
    v) VERSION="$OPTARG" ;;
    c) UPDATE_CLASS="$OPTARG" ;;
    n) RELEASE_NOTES="$OPTARG" ;;
    b) BLOCKMAP_PATH="$OPTARG" ;;
    p) DELTA_PATH="$OPTARG" ;;
    r) REPO="$OPTARG" ;;
    d) DRY_RUN=true ;;
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

echo "=== Quantum IDE Release Distribution Publisher ==="
if [[ "$DRY_RUN" == true ]]; then
  echo ">>> DRY RUN MODE ACTIVATED <<<"
fi
echo "Target Repo:  $REPO"
echo "Version:      $VERSION"
echo "Installer:    $FILE_NAME ($FILE_SIZE bytes)"
echo "Update Class: $UPDATE_CLASS"

# Compute SHA-256
SHA256=$(sha256sum "$INSTALLER_PATH" | awk '{print $1}')
echo "SHA-256:      $SHA256"
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
- **SHA-256:** \`$SHA256\`

### Notice
This release is distributed exclusively through the official Quantum distribution portal."

if [[ -n "$RELEASE_NOTES" && -f "$RELEASE_NOTES" ]]; then
  NOTES=$(cat "$RELEASE_NOTES")
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_ROOT/channels/friends-beta/windows-x64.json"
MANIFEST_BAK="$MANIFEST.bak"
cp "$MANIFEST" "$MANIFEST_BAK"

DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/$FILE_NAME"
NOTES_URL="https://github.com/$REPO/releases/tag/$VERSION"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

UPLOAD_FILES=("$INSTALLER_PATH" "$SHA_FILE")
if [[ -n "$BLOCKMAP_PATH" && -f "$BLOCKMAP_PATH" ]]; then
  UPLOAD_FILES+=("$BLOCKMAP_PATH")
fi
if [[ -n "$DELTA_PATH" && -f "$DELTA_PATH" ]]; then
  UPLOAD_FILES+=("$DELTA_PATH")
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "[1/3] [DryRun] Simulated GitHub Release create on $REPO for $VERSION"
  echo "      Assets: ${UPLOAD_FILES[*]}"
else
  echo "[1/3] Creating / Updating GitHub Release..."
  if gh release view "$VERSION" --repo "$REPO" >/dev/null 2>&1; then
    echo "Release $VERSION already exists. Uploading assets..."
    gh release upload "$VERSION" "${UPLOAD_FILES[@]}" --repo "$REPO" --clobber
  else
    gh release create "$VERSION" "${UPLOAD_FILES[@]}" \
      --repo "$REPO" \
      --title "Quantum IDE $VERSION (Friends Beta)" \
      --notes "$NOTES" \
      --prerelease
  fi
  echo "      ✓ GitHub Release active."
fi

echo "[2/3] Updating and validating release manifest..."
BLOCKMAP_NAME=""
if [[ -n "$BLOCKMAP_PATH" ]]; then
  BLOCKMAP_NAME=$(basename "$BLOCKMAP_PATH")
fi

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
if ('$BLOCKMAP_NAME') {
  data.deltaSupport.enabled = true;
  data.deltaSupport.blockmapUrl = 'https://github.com/$REPO/releases/download/$VERSION/$BLOCKMAP_NAME';
  data.deltaSupport.fallbackUrl = '$DOWNLOAD_URL';
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
"

# Validate manifest integrity
if command -v node >/dev/null 2>&1; then
  if ! node "$SCRIPT_DIR/verify-manifest.js"; then
    echo "Error: Manifest integrity verification failed!"
    mv "$MANIFEST_BAK" "$MANIFEST"
    exit 1
  fi
fi

if [[ "$DRY_RUN" == true ]]; then
  mv "$MANIFEST_BAK" "$MANIFEST"
  rm -f "$SHA_FILE"
  echo "      ✓ [DryRun] Manifest validation PASSED. Reverted local changes."
  echo "=== Dry run successful! No changes committed. ==="
  exit 0
fi

rm -f "$MANIFEST_BAK"

# Commit & Push
echo "[3/3] Committing and pushing manifest..."
cd "$REPO_ROOT"
git add channels/friends-beta/windows-x64.json
git commit -m "release(friends-beta): publish Quantum IDE $VERSION for windows-x64"
git push origin main

echo "=== Release $VERSION published successfully! ==="
echo "Download URL: $DOWNLOAD_URL"
echo "Portal:       https://Quantum-IDE.github.io/quantum-ide-distribution/"
