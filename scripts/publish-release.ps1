<#
.SYNOPSIS
    Official Quantum IDE Release Publisher for Distribution Infrastructure.
.DESCRIPTION
    Strictly locked to the official repository: Quantum-IDE/quantum-ide-distribution.
    Receives an externally built installer artifact, validates integrity, verifies GitHub identity,
    calculates SHA-256, creates a GitHub Release, uploads assets, updates and validates
    channels/friends-beta/windows-x64.json, and pushes strictly to the official repository.
.PARAMETER InstallerPath
    Absolute or relative path to the Windows installer (.exe, .msi, or .zip).
.PARAMETER Version
    Semantic version tag (e.g., v0.1.0-beta.1).
.PARAMETER UpdateClass
    Update classification: 'manual-consent' (major/features) or 'silent-next-launch' (patch/bugfix).
.PARAMETER ReleaseNotes
    Markdown release notes string or path to a markdown file.
.PARAMETER BlockmapPath
    Optional path to the .blockmap differential update file.
.PARAMETER DeltaPath
    Optional path to a differential delta package.
.PARAMETER DryRun
    Simulates release validation, identity checks, hashing, and schema verification without modifying GitHub or git.
.EXAMPLE
    .\scripts\publish-release.ps1 -InstallerPath "C:\Builds\Quantum-Setup-0.1.0-beta.1-x64.exe" -Version "v0.1.0-beta.1" -DryRun
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$InstallerPath,

    [Parameter(Mandatory = $false)]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [ValidateSet("manual-consent", "silent-next-launch")]
    [string]$UpdateClass = "manual-consent",

    [Parameter(Mandatory = $false)]
    [string]$ReleaseNotes = "",

    [Parameter(Mandatory = $false)]
    [string]$BlockmapPath = "",

    [Parameter(Mandatory = $false)]
    [string]$DeltaPath = "",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# STRICT CONSTANTS — Locked to Official Repository & Identity
$OFFICIAL_REPO = "Quantum-IDE/quantum-ide-distribution"
$OFFICIAL_OWNER = "Quantum-IDE"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   Quantum IDE — Official Release Publisher" -ForegroundColor Cyan
Write-Host "   Repository: $OFFICIAL_REPO (LOCKED)" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "   [DRY RUN MODE - Verification only, zero modifications]" -ForegroundColor Magenta
}
Write-Host "========================================================`n" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. VERIFY GITHUB CLI & AUTHENTICATED IDENTITY
# ---------------------------------------------------------------------------
Write-Host "[1/7] Verifying GitHub CLI and authenticated identity..." -ForegroundColor Yellow

if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI ('gh') is not installed or not in PATH."
}

# Verify gh session
$null = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run 'gh auth login' to authenticate with the official $OFFICIAL_OWNER account."
}

# Query authenticated user login
$currentUser = (gh api user --jq .login 2>&1)
if ($LASTEXITCODE -ne 0 -or -not $currentUser) {
    throw "Failed to query authenticated GitHub user identity."
}
$currentUser = $currentUser.Trim()

if ($currentUser.ToLower() -ne $OFFICIAL_OWNER.ToLower()) {
    throw "SECURITY ALERT: Authenticated as '$currentUser', but official publishing requires '$OFFICIAL_OWNER'. Publishing aborted."
}
Write-Host "      [OK] Authenticated identity verified: $currentUser (OFFICIAL)" -ForegroundColor Green

# Verify access to official repository
$repoCheck = (gh api "repos/$OFFICIAL_REPO" --jq .full_name 2>&1)
if ($LASTEXITCODE -ne 0 -or $repoCheck.Trim() -ne $OFFICIAL_REPO) {
    throw "SECURITY ALERT: Cannot access official repository '$OFFICIAL_REPO' with the current session."
}
Write-Host "      [OK] Verified access to target repository: $OFFICIAL_REPO" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 2. VERIFY LOCAL GIT REMOTE TARGET
# ---------------------------------------------------------------------------
Write-Host "[2/7] Verifying Git remote target..." -ForegroundColor Yellow
if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or not in PATH."
}

Push-Location $RepoRoot
try {
    $remoteUrl = (git config --get remote.origin.url 2>&1)
    if ($LASTEXITCODE -ne 0 -or -not $remoteUrl) {
        throw "Could not determine git remote.origin.url in $RepoRoot"
    }
    $remoteUrl = $remoteUrl.Trim()

    # Remote URL must point strictly to Quantum-IDE/quantum-ide-distribution
    $expectedRegex = '^(https:\/\/github\.com\/|git@github\.com:)Quantum-IDE\/quantum-ide-distribution(\.git)?$'
    if ($remoteUrl -notmatch $expectedRegex) {
        throw "SECURITY ALERT: Local repository remote.origin.url is '$remoteUrl', which does not match official repository '$OFFICIAL_REPO'. Publishing aborted."
    }
    Write-Host "      [OK] Git remote verified: $remoteUrl" -ForegroundColor Green
} finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# 3. VALIDATE INSTALLER & INPUT ARTIFACTS
# ---------------------------------------------------------------------------
Write-Host "[3/7] Validating installer artifact..." -ForegroundColor Yellow
if (-not (Test-Path $InstallerPath)) {
    throw "Installer file not found at path: $InstallerPath"
}
$installerItem = Get-Item $InstallerPath
if ($installerItem.Length -le 0) {
    throw "Installer file is empty (0 bytes): $InstallerPath"
}
$validExtensions = @(".exe", ".msi", ".zip")
if (-not ($validExtensions -contains $installerItem.Extension.ToLower())) {
    Write-Warning "File extension '$($installerItem.Extension)' is unusual for a Windows installer."
}

# Auto-detect version if not supplied
if (-not $Version) {
    if ($installerItem.Name -match "(\d+\.\d+\.\d+(-beta\.\d+)?)") {
        $Version = "v" + $Matches[1]
    } else {
        $Version = Read-Host "Enter release version tag (e.g. v0.1.0-beta.1)"
    }
}
if (-not $Version.StartsWith("v")) {
    $Version = "v$Version"
}

Write-Host "      [OK] Target Version: $Version" -ForegroundColor Green
Write-Host "      [OK] Target File:    $($installerItem.Name) ($([Math]::Round($installerItem.Length / 1MB, 2)) MB)" -ForegroundColor Green
Write-Host "      [OK] Update Class:   $UpdateClass" -ForegroundColor Green

# Validate optional Delta / Blockmap files
if ($BlockmapPath) {
    if (-not (Test-Path $BlockmapPath)) {
        throw "Specified Blockmap file not found: $BlockmapPath"
    }
    Write-Host "      [OK] Blockmap asset verified: $(Split-Path -Leaf $BlockmapPath)" -ForegroundColor Green
}
if ($DeltaPath) {
    if (-not (Test-Path $DeltaPath)) {
        throw "Specified Delta file not found: $DeltaPath"
    }
    Write-Host "      [OK] Delta asset verified: $(Split-Path -Leaf $DeltaPath)" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 4. CALCULATE CRYPTOGRAPHIC DIGEST (SHA-256)
# ---------------------------------------------------------------------------
Write-Host "[4/7] Calculating SHA-256 cryptographic digest..." -ForegroundColor Yellow
$hashResult = Get-FileHash -Path $InstallerPath -Algorithm SHA256
$sha256 = $hashResult.Hash.ToLower()

$shaFile = "$InstallerPath.sha256"
try {
    "$sha256  $($installerItem.Name)" | Out-File -FilePath $shaFile -Encoding utf8 -ErrorAction Stop
} catch {
    $shaFile = Join-Path ([System.IO.Path]::GetTempPath()) "$($installerItem.Name).sha256"
    "$sha256  $($installerItem.Name)" | Out-File -FilePath $shaFile -Encoding utf8
}
Write-Host "      [OK] SHA-256: $sha256" -ForegroundColor Green
Write-Host "      [OK] Checksum file prepared: $shaFile" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 5. PREPARE RELEASE NOTES
# ---------------------------------------------------------------------------
Write-Host "[5/7] Preparing release notes..." -ForegroundColor Yellow
$notesContent = ""
if ($ReleaseNotes -and (Test-Path $ReleaseNotes)) {
    $notesContent = Get-Content -Path $ReleaseNotes -Raw
} elseif ($ReleaseNotes) {
    $notesContent = $ReleaseNotes
} else {
    $notesContent = @"
## Quantum IDE Friends Beta ($Version)

### Release Details
- **Version:** $Version
- **Platform:** Windows x64
- **Channel:** Friends Beta
- **Update Classification:** $UpdateClass
- **Published:** $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss")) UTC

### Verification & Checksum
- **Filename:** $($installerItem.Name)
- **Size:** $([Math]::Round($installerItem.Length / 1MB, 2)) MB ($($installerItem.Length) bytes)
- **SHA-256:** \`$sha256\`

### Notice
This release is distributed exclusively through the official Quantum distribution portal.
"@
}
Write-Host "      [OK] Release notes compiled." -ForegroundColor Green

# ---------------------------------------------------------------------------
# 6. CREATE GITHUB RELEASE (OR DRY-RUN SIMULATION)
# ---------------------------------------------------------------------------
Write-Host "[6/7] Managing GitHub Release on $OFFICIAL_REPO..." -ForegroundColor Yellow
$releaseTitle = "Quantum IDE $Version (Friends Beta)"

$uploadAssets = @($InstallerPath, $shaFile)
if ($BlockmapPath) { $uploadAssets += $BlockmapPath }
if ($DeltaPath) { $uploadAssets += $DeltaPath }

if ($DryRun) {
    Write-Host "      [OK] [DryRun] Simulated GitHub Release creation: $releaseTitle" -ForegroundColor Magenta
    Write-Host "      [OK] [DryRun] Assets to upload: $($uploadAssets -join ', ')" -ForegroundColor Magenta
} else {
    # Check if release already exists
    $releaseExists = $false
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        & gh release view $Version --repo $OFFICIAL_REPO 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $releaseExists = $true
        }
    } finally {
        $ErrorActionPreference = $prevEAP
    }

    if ($releaseExists) {
        Write-Warning "Release $Version already exists on $OFFICIAL_REPO. Uploading assets to existing release..."
        & gh release upload $Version $uploadAssets --repo $OFFICIAL_REPO --clobber
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to upload assets to existing GitHub release on $OFFICIAL_REPO."
        }
    } else {
        $tempNotesPath = Join-Path ([System.IO.Path]::GetTempPath()) "quantum-release-notes-$Version.md"
        $notesContent | Out-File -FilePath $tempNotesPath -Encoding utf8
        & gh release create $Version $uploadAssets `
            --repo $OFFICIAL_REPO `
            --title $releaseTitle `
            --notes-file $tempNotesPath `
            --prerelease
        $createExit = $LASTEXITCODE
        Remove-Item $tempNotesPath -Force -ErrorAction SilentlyContinue
        if ($createExit -ne 0) {
            throw "Failed to create GitHub release on $OFFICIAL_REPO."
        }
    }

    # Verify assets on release
    $releaseCheck = gh release view $Version --repo $OFFICIAL_REPO --json assets | ConvertFrom-Json
    $uploadedNames = $releaseCheck.assets | ForEach-Object { $_.name }
    if (-not ($uploadedNames -contains $installerItem.Name)) {
        throw "Asset upload verification failed: $($installerItem.Name) not found in release assets."
    }
    Write-Host "      [OK] GitHub Release active and assets verified." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 7. UPDATE MANIFEST, VALIDATE SCHEMA, COMMIT & PUSH
# ---------------------------------------------------------------------------
Write-Host "[7/7] Updating release manifest & executing schema verification..." -ForegroundColor Yellow
$manifestPath = Join-Path $RepoRoot "channels\friends-beta\windows-x64.json"
$manifestBackupPath = "$manifestPath.bak"
Copy-Item $manifestPath $manifestBackupPath

$downloadUrl = "https://github.com/$OFFICIAL_REPO/releases/download/$Version/$($installerItem.Name)"
$releaseNotesUrl = "https://github.com/$OFFICIAL_REPO/releases/tag/$Version"

try {
    $manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
    $manifest.version = $Version
    $manifest.updateClass = $UpdateClass
    $manifest.publishedAt = [DateTime]::UtcNow.ToString("o")
    $manifest.available = $true
    $manifest.downloadUrl = $downloadUrl
    $manifest.fileName = $installerItem.Name
    $manifest.sizeBytes = $installerItem.Length
    $manifest.sha256 = $sha256
    $manifest.releaseNotesUrl = $releaseNotesUrl

    if ($BlockmapPath) {
        $blockmapName = Split-Path -Leaf $BlockmapPath
        $manifest.deltaSupport.enabled = $true
        $manifest.deltaSupport.blockmapUrl = "https://github.com/$OFFICIAL_REPO/releases/download/$Version/$blockmapName"
        $manifest.deltaSupport.fallbackUrl = $downloadUrl
    }

    $manifestJson = $manifest | ConvertTo-Json -Depth 5
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($manifestPath, $manifestJson + "`n", $utf8NoBom)

    # Validate updated manifest with verify-manifest.js (Ajv 8 Draft-07)
    $verifyPassed = $false
    $verifyOutput = ""

    if ($RepoRoot -match '^\\\\wsl(\.localhost)?\\([^\\]+)(.*)$') {
        $distro = $Matches[2]
        $linuxPath = $Matches[3] -replace '\\', '/'
        if (Get-Command "wsl" -ErrorAction SilentlyContinue) {
            $verifyOutput = wsl -d $distro bash -c "cd '$linuxPath' && node scripts/verify-manifest.js" 2>&1
            if ($LASTEXITCODE -eq 0) { $verifyPassed = $true }
        }
    }

    if (-not $verifyPassed -and (Get-Command "node" -ErrorAction SilentlyContinue)) {
        Push-Location $RepoRoot
        try {
            $verifyOutput = & node "scripts\verify-manifest.js" 2>&1
            if ($LASTEXITCODE -eq 0) { $verifyPassed = $true }
        } finally {
            Pop-Location
        }
    }

    if (-not $verifyPassed) {
        throw "JSON Schema validation failed for updated manifest:`n$verifyOutput"
    }
    Write-Host "      [OK] Manifest verified against JSON Schema Draft-07 (Ajv 8)." -ForegroundColor Green

    if ($DryRun) {
        Copy-Item $manifestBackupPath $manifestPath -Force
        Remove-Item $manifestBackupPath -Force
        if (Test-Path $shaFile) { Remove-Item $shaFile -Force -ErrorAction SilentlyContinue }
        Write-Host "      [OK] [DryRun] Manifest validation PASSED. Reverted local changes." -ForegroundColor Magenta
    } else {
        Remove-Item $manifestBackupPath -Force
        Write-Host "      [OK] Manifest written and verified." -ForegroundColor Green

        # Strictly stage only the release manifest file (NO git add -A)
        Push-Location $RepoRoot
        try {
            git add "channels/friends-beta/windows-x64.json"
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to stage release manifest in git."
            }

            git commit -m "release(friends-beta): publish Quantum IDE $Version for windows-x64"
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to commit release manifest."
            }

            git push origin main
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to push release manifest to origin main."
            }
            Write-Host "      [OK] Manifest pushed to official repository. GitHub Pages will auto-deploy." -ForegroundColor Green
        } finally {
            Pop-Location
        }
    }
} catch {
    if (Test-Path $manifestBackupPath) {
        Copy-Item $manifestBackupPath $manifestPath -Force
        Remove-Item $manifestBackupPath -Force
    }
    throw $_
}

Write-Host "`n========================================================" -ForegroundColor Green
if ($DryRun) {
    Write-Host "   Quantum IDE Release $Version Dry Run Completed! (PASSED)" -ForegroundColor Magenta
} else {
    Write-Host "   Quantum IDE Release $Version Published Successfully!  " -ForegroundColor Green
}
Write-Host "========================================================" -ForegroundColor Green
Write-Host "• Official Repo       : $OFFICIAL_REPO" -ForegroundColor Cyan
Write-Host "• Direct Download URL : $downloadUrl" -ForegroundColor Cyan
Write-Host "• SHA-256 Checksum    : $sha256" -ForegroundColor Cyan
Write-Host "• Release Notes       : $releaseNotesUrl" -ForegroundColor Cyan
Write-Host "• Distribution Portal : https://quantum-ide.github.io/quantum-ide-distribution/`n" -ForegroundColor Cyan
