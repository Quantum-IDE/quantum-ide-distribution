#!/usr/bin/env bash
set -euo pipefail

# publish-release.sh — Quantum IDE Release Distribution Publisher (Bash/WSL/Linux)
# Strictly locked to official repository: Quantum-IDE/quantum-ide-distribution

OFFICIAL_REPO="Quantum-IDE/quantum-ide-distribution"
OFFICIAL_OWNER="Quantum-IDE"
UPDATE_CLASS="manual-consent"
VERSION=""
RELEASE_NOTES=""
BLOCKMAP_PATH=""
DELTA_PATH=""
DRY_RUN=false

usage() {
  cat << EOF
Usage: $0 -f <installer-path> [-v <version>] [-c <update-class>] [-n <notes-file>] [-b <blockmap-path>] [-p <delta-path>] [-d]

Options:
  -f <path>    Path to installer file (.exe, .msi, .zip) [Required]
  -v <version> Semantic version tag (e.g., v0.1.0-beta.1) [Auto-detected if omitted]
  -c <class>   Update classification: 'manual-consent' (default) or 'silent-next-launch'
  -n <path>    Path to markdown release notes file
  -b <path>    Path to differential .blockmap file (optional)
  -p <path>    Path to delta update package (optional)
  -d           Dry run mode: validates file, identity, hashes, and schema without modifying GitHub or git
  -h           Show this help message
EOF
  exit 1
}

INSTALLER_PATH=""

while getopts "f:v:c:n:b:p:dh" opt; do
  case "$opt" in
    f) INSTALLER_PATH="$OPTARG" ;;
    v) VERSION="$OPTARG" ;;
    c) UPDATE_CLASS="$OPTARG" ;;
    n) RELEASE_NOTES="$OPTARG" ;;
    b) BLOCKMAP_PATH="$OPTARG" ;;
    p) DELTA_PATH="$OPTARG" ;;
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

echo "=== Quantum IDE Release Distribution Publisher ==="
echo "Official Repository: $OFFICIAL_REPO (LOCKED)"
if [[ "$DRY_RUN" == true ]]; then
  echo ">>> DRY RUN MODE ACTIVATED <<<"
fi

# 1. VERIFY GITHUB CLI & AUTHENTICATED IDENTITY
echo "[1/7] Verifying GitHub CLI and authenticated identity..."
GH_CMD="gh"
if ! command -v gh >/dev/null 2>&1; then
  if command -v gh.exe >/dev/null 2>&1; then
    GH_CMD="gh.exe"
  else
    echo "Error: GitHub CLI ('gh' or 'gh.exe') is not installed or not in PATH."
    exit 1
  fi
fi

if ! "$GH_CMD" auth status >/dev/null 2>&1; then
  echo "Error: GitHub CLI is not authenticated. Run '$GH_CMD auth login' first."
  exit 1
fi

CURRENT_USER=$("$GH_CMD" api user --jq .login 2>/dev/null || echo "")
if [[ -z "$CURRENT_USER" ]]; then
  echo "Error: Failed to query authenticated GitHub user identity."
  exit 1
fi

if [[ "${CURRENT_USER,,}" != "${OFFICIAL_OWNER,,}" ]]; then
  echo "SECURITY ALERT: Authenticated as '$CURRENT_USER', but official publishing requires '$OFFICIAL_OWNER'. Aborted."
  exit 1
fi
echo "      ✓ Authenticated identity verified: $CURRENT_USER (OFFICIAL)"

if ! "$GH_CMD" api "repos/$OFFICIAL_REPO" >/dev/null 2>&1; then
  echo "SECURITY ALERT: Current session cannot access official repo '$OFFICIAL_REPO'. Aborted."
  exit 1
fi
echo "      ✓ Verified access to target repository: $OFFICIAL_REPO"

# 2. VERIFY LOCAL GIT REMOTE TARGET
echo "[2/7] Verifying Git remote target..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REMOTE_URL=$(git -C "$REPO_ROOT" config --get remote.origin.url || echo "")
if [[ -z "$REMOTE_URL" ]]; then
  echo "Error: Could not determine git remote.origin.url in $REPO_ROOT"
  exit 1
fi

EXPECTED_REGEX='^(https://github\.com/|git@github\.com:)Quantum-IDE/quantum-ide-distribution(\.git)?$'
if [[ ! "$REMOTE_URL" =~ $EXPECTED_REGEX ]]; then
  echo "SECURITY ALERT: Local git remote.origin.url is '$REMOTE_URL', not matching '$OFFICIAL_REPO'. Aborted."
  exit 1
fi
echo "      ✓ Git remote verified: $REMOTE_URL"

# 3. DETECT & NORMALIZE VERSION
echo "[3/7] Validating artifact and version..."
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

echo "      ✓ Target Version: $VERSION"
echo "      ✓ Installer:      $FILE_NAME ($FILE_SIZE bytes)"
echo "      ✓ Update Class:   $UPDATE_CLASS"

# 4. COMPUTE CRYPTOGRAPHIC SHA-256
echo "[4/7] Calculating SHA-256 cryptographic digest..."
SHA256=$(sha256sum "$INSTALLER_PATH" | awk '{print $1}')
echo "      ✓ SHA-256:        $SHA256"
SHA_FILE="${INSTALLER_PATH}.sha256"
echo "$SHA256  $FILE_NAME" > "$SHA_FILE"
echo "      ✓ Checksum file:  $SHA_FILE"

# 5. PREPARE NOTES
echo "[5/7] Preparing release notes..."
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

MANIFEST="$REPO_ROOT/channels/friends-beta/windows-x64.json"
MANIFEST_BAK="$MANIFEST.bak"
cp "$MANIFEST" "$MANIFEST_BAK"

DOWNLOAD_URL="https://github.com/$OFFICIAL_REPO/releases/download/$VERSION/$FILE_NAME"
NOTES_URL="https://github.com/$OFFICIAL_REPO/releases/tag/$VERSION"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

UPLOAD_FILES=("$INSTALLER_PATH" "$SHA_FILE")
if [[ -n "$BLOCKMAP_PATH" && -f "$BLOCKMAP_PATH" ]]; then
  UPLOAD_FILES+=("$BLOCKMAP_PATH")
fi
if [[ -n "$DELTA_PATH" && -f "$DELTA_PATH" ]]; then
  UPLOAD_FILES+=("$DELTA_PATH")
fi

# 6. GITHUB RELEASE
echo "[6/7] Managing GitHub Release on $OFFICIAL_REPO..."
if [[ "$DRY_RUN" == true ]]; then
  echo "      ✓ [DryRun] Simulated GitHub Release create on $OFFICIAL_REPO for $VERSION"
  echo "      ✓ [DryRun] Assets to upload: ${UPLOAD_FILES[*]}"
else
  if "$GH_CMD" release view "$VERSION" --repo "$OFFICIAL_REPO" >/dev/null 2>&1; then
    echo "Release $VERSION already exists. Uploading assets..."
    "$GH_CMD" release upload "$VERSION" "${UPLOAD_FILES[@]}" --repo "$OFFICIAL_REPO" --clobber
  else
    "$GH_CMD" release create "$VERSION" "${UPLOAD_FILES[@]}" \
      --repo "$OFFICIAL_REPO" \
      --title "Quantum IDE $VERSION (Friends Beta)" \
      --notes "$NOTES" \
      --prerelease
  fi
  echo "      ✓ GitHub Release active and assets uploaded."
fi

# 7. UPDATE MANIFEST & VALIDATE WITH AJV 8
echo "[7/7] Updating release manifest and verifying schema..."
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
  data.deltaSupport.blockmapUrl = 'https://github.com/$OFFICIAL_REPO/releases/download/$VERSION/$BLOCKMAP_NAME';
  data.deltaSupport.fallbackUrl = '$DOWNLOAD_URL';
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
"

# Validate manifest integrity using verify-manifest.js
if ! node "$SCRIPT_DIR/verify-manifest.js"; then
  echo "Error: Manifest schema integrity verification failed!"
  mv "$MANIFEST_BAK" "$MANIFEST"
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  mv "$MANIFEST_BAK" "$MANIFEST"
  rm -f "$SHA_FILE"
  echo "      ✓ [DryRun] Manifest validation PASSED. Reverted local changes."
  echo "=== Dry run successful! No changes committed. ==="
  exit 0
fi

rm -f "$MANIFEST_BAK"

# Commit & Push ONLY the specific manifest file (NO git add -A)
echo "Committing and pushing manifest..."
cd "$REPO_ROOT"
git add channels/friends-beta/windows-x64.json
git commit -m "release(friends-beta): publish Quantum IDE $VERSION for windows-x64"
git push origin main

echo "=== Release $VERSION published successfully! ==="
echo "Official Repo: $OFFICIAL_REPO"
echo "Download URL:  $DOWNLOAD_URL"
echo "Portal:        https://quantum-ide.github.io/quantum-ide-distribution/"
