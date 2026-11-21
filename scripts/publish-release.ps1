<#
.SYNOPSIS
    Official Quantum IDE Release Publisher for Distribution Infrastructure.
.DESCRIPTION
    Receives an externally built installer artifact, validates integrity, calculates SHA-256,
    creates a GitHub Release in Quantum-IDE/quantum-ide-distribution, uploads assets,
    and updates the dynamic release manifest channels/friends-beta/windows-x64.json.
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
.PARAMETER Repo
    Target GitHub repository in 'owner/repo' format. Defaults to 'Quantum-IDE/quantum-ide-distribution'.
.PARAMETER DryRun
    Simulates release validation, hashing, and manifest verification without creating GitHub Releases or pushing git commits.
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
    [string]$Repo = "Quantum-IDE/quantum-ide-distribution",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   Quantum IDE — Release Distribution Publisher" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "   [DRY RUN MODE - No external changes will be made]" -ForegroundColor Magenta
}
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Check GitHub CLI
Write-Host "[1/7] Verifying GitHub CLI and authentication..." -ForegroundColor Yellow
if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI ('gh') is not installed or not in PATH. Please install gh to publish releases."
}

if (-not $DryRun) {
    $authStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "GitHub CLI is not authenticated. Run 'gh auth login' first."
    }
    Write-Host "      ✓ GitHub CLI is authenticated." -ForegroundColor Green
} else {
    Write-Host "      ✓ [DryRun] GitHub CLI checked." -ForegroundColor Green
}

# 2. Validate Installer File
Write-Host "[2/7] Validating installer file..." -ForegroundColor Yellow
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

Write-Host "      ✓ Target Version: $Version" -ForegroundColor Green
Write-Host "      ✓ Target File:    $($installerItem.Name) ($([Math]::Round($installerItem.Length / 1MB, 2)) MB)" -ForegroundColor Green
Write-Host "      ✓ Update Class:   $UpdateClass" -ForegroundColor Green

# Validate optional Delta / Blockmap files
if ($BlockmapPath) {
    if (-not (Test-Path $BlockmapPath)) {
        throw "Specified Blockmap file not found: $BlockmapPath"
    }
    Write-Host "      ✓ Blockmap asset verified: $(Split-Path -Leaf $BlockmapPath)" -ForegroundColor Green
}
if ($DeltaPath) {
    if (-not (Test-Path $DeltaPath)) {
        throw "Specified Delta file not found: $DeltaPath"
    }
    Write-Host "      ✓ Delta asset verified: $(Split-Path -Leaf $DeltaPath)" -ForegroundColor Green
}

# 3. Calculate Cryptographic Digest
Write-Host "[3/7] Calculating SHA-256 cryptographic digest..." -ForegroundColor Yellow
$hashResult = Get-FileHash -Path $InstallerPath -Algorithm SHA256
$sha256 = $hashResult.Hash.ToLower()
$shaFile = "$InstallerPath.sha256"
try {
    "$sha256  $($installerItem.Name)" | Out-File -FilePath $shaFile -Encoding utf8 -ErrorAction Stop
} catch {
    $shaFile = Join-Path ([System.IO.Path]::GetTempPath()) "$($installerItem.Name).sha256"
    "$sha256  $($installerItem.Name)" | Out-File -FilePath $shaFile -Encoding utf8
}
Write-Host "      ✓ SHA-256: $sha256" -ForegroundColor Green
Write-Host "      ✓ Checksum file prepared: $shaFile" -ForegroundColor Green

# 4. Prepare Release Notes
Write-Host "[4/7] Preparing release notes..." -ForegroundColor Yellow
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
Write-Host "      ✓ Release notes compiled." -ForegroundColor Green

# 5. Create GitHub Release
Write-Host "[5/7] Creating GitHub Release on $Repo..." -ForegroundColor Yellow
$releaseTitle = "Quantum IDE $Version (Friends Beta)"

$uploadAssets = @($InstallerPath, $shaFile)
if ($BlockmapPath) { $uploadAssets += $BlockmapPath }
if ($DeltaPath) { $uploadAssets += $DeltaPath }

if ($DryRun) {
    Write-Host "      ✓ [DryRun] Simulated GitHub Release creation: $releaseTitle" -ForegroundColor Magenta
    Write-Host "      ✓ [DryRun] Assets to upload: $($uploadAssets -join ', ')" -ForegroundColor Magenta
} else {
    # Check if release already exists
    $existingRelease = gh release view $Version --repo $Repo 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Warning "Release $Version already exists on $Repo. Uploading assets to existing release..."
        gh release upload $Version $uploadAssets --repo $Repo --clobber
    } else {
        gh release create $Version $uploadAssets `
            --repo $Repo `
            --title $releaseTitle `
            --notes $notesContent `
            --prerelease
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create or upload assets to GitHub release on $Repo."
    }

    # Verify assets on release
    $releaseCheck = gh release view $Version --repo $Repo --json assets | ConvertFrom-Json
    $uploadedNames = $releaseCheck.assets | ForEach-Object { $_.name }
    if (-not ($uploadedNames -contains $installerItem.Name)) {
        throw "Asset upload verification failed: $($installerItem.Name) not found in release assets."
    }
    Write-Host "      ✓ GitHub Release active and assets verified." -ForegroundColor Green
}

# 6. Update Release Manifest & Validate
Write-Host "[6/7] Updating and verifying release manifest..." -ForegroundColor Yellow
$manifestPath = Join-Path $RepoRoot "channels\friends-beta\windows-x64.json"
$manifestBackupPath = "$manifestPath.bak"
Copy-Item $manifestPath $manifestBackupPath

$downloadUrl = "https://github.com/$Repo/releases/download/$Version/$($installerItem.Name)"
$releaseNotesUrl = "https://github.com/$Repo/releases/tag/$Version"

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
        $manifest.deltaSupport.blockmapUrl = "https://github.com/$Repo/releases/download/$Version/$blockmapName"
        $manifest.deltaSupport.fallbackUrl = $downloadUrl
    }

    $manifestJson = $manifest | ConvertTo-Json -Depth 5
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($manifestPath, $manifestJson + "`n", $utf8NoBom)

    # Validate updated manifest with verify-manifest.js
    $verifyPassed = $false
    $verifyOutput = ""

    # If repository is on a WSL share, run via WSL node
    if ($RepoRoot -match '^\\\\wsl(\.localhost)?\\([^\\]+)(.*)$') {
        $distro = $Matches[2]
        $linuxPath = $Matches[3] -replace '\\', '/'
        if (Get-Command "wsl" -ErrorAction SilentlyContinue) {
            $verifyOutput = wsl -d $distro bash -c "cd '$linuxPath' && node scripts/verify-manifest.js" 2>&1
            if ($LASTEXITCODE -eq 0) { $verifyPassed = $true }
        }
    }

    # Otherwise execute with native node
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
        throw "Integrity verification failed for updated manifest:`n$verifyOutput"
    }
    Write-Host "      ✓ Manifest schema integrity verified with verify-manifest.js." -ForegroundColor Green

    if ($DryRun) {
        # Restore backup in dry run mode
        Copy-Item $manifestBackupPath $manifestPath -Force
        Remove-Item $manifestBackupPath -Force
        if (Test-Path $shaFile) { Remove-Item $shaFile -Force -ErrorAction SilentlyContinue }
        Write-Host "      ✓ [DryRun] Manifest validation succeeded. Reverted local file changes." -ForegroundColor Magenta
    } else {
        Remove-Item $manifestBackupPath -Force
        Write-Host "      ✓ Manifest written and ready for deployment." -ForegroundColor Green
    }
} catch {
    # Revert manifest on any failure
    if (Test-Path $manifestBackupPath) {
        Copy-Item $manifestBackupPath $manifestPath -Force
        Remove-Item $manifestBackupPath -Force
    }
    throw $_
}

# 7. Commit & Push Manifest Update
Write-Host "[7/7] Committing and pushing manifest update..." -ForegroundColor Yellow
if ($DryRun) {
    Write-Host "      ✓ [DryRun] Simulated git commit and push." -ForegroundColor Magenta
} else {
    Push-Location $RepoRoot
    try {
        git add "channels/friends-beta/windows-x64.json"
        git commit -m "release(friends-beta): publish Quantum IDE $Version for windows-x64"
        git push origin main
        Write-Host "      ✓ Pushed to repository. GitHub Pages will auto-deploy the update." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

Write-Host "`n========================================================" -ForegroundColor Green
if ($DryRun) {
    Write-Host "   Quantum IDE Release $Version Dry Run Completed! (PASSED)" -ForegroundColor Magenta
} else {
    Write-Host "   Quantum IDE Release $Version Published Successfully!  " -ForegroundColor Green
}
Write-Host "========================================================" -ForegroundColor Green
Write-Host "• Direct Download URL : $downloadUrl" -ForegroundColor Cyan
Write-Host "• SHA-256 Checksum    : $sha256" -ForegroundColor Cyan
Write-Host "• Release Notes       : $releaseNotesUrl" -ForegroundColor Cyan
Write-Host "• Distribution Portal : https://Quantum-IDE.github.io/quantum-ide-distribution/`n" -ForegroundColor Cyan
