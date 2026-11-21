<#
.SYNOPSIS
    Official Quantum IDE Release Publisher for Distribution Infrastructure.
.DESCRIPTION
    Receives an externally built installer artifact, validates integrity, calculates SHA-256,
    creates a GitHub Release in Quantum-IDE/quantum-ide-distribution-, uploads assets,
    and updates the dynamic release manifest channels/friends-beta/windows-x64.json.
.PARAMETER InstallerPath
    Absolute or relative path to the Windows installer (.exe, .msi, or .zip).
.PARAMETER Version
    Semantic version tag (e.g., v0.1.0-beta.1).
.PARAMETER UpdateClass
    Update classification: 'manual-consent' (major/features) or 'silent-next-launch' (patch/bugfix).
.PARAMETER ReleaseNotes
    Markdown release notes string or path to a markdown file.
.EXAMPLE
    .\scripts\publish-release.ps1 -InstallerPath "C:\Builds\Quantum-Setup-0.1.0-beta.1-x64.exe" -Version "v0.1.0-beta.1"
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
    [string]$Repo = "Quantum-IDE/quantum-ide-distribution-"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   Quantum IDE — Release Distribution Publisher" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Check GitHub CLI
Write-Host "[1/7] Verifying GitHub CLI..." -ForegroundColor Yellow
if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI ('gh') is not installed or not in PATH. Please install gh to publish releases."
}
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run 'gh auth login' first."
}
Write-Host "      ✓ GitHub CLI is authenticated." -ForegroundColor Green

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

# 3. Calculate Cryptographic Digest
Write-Host "[3/7] Calculating SHA-256 cryptographic digest..." -ForegroundColor Yellow
$hashResult = Get-FileHash -Path $InstallerPath -Algorithm SHA256
$sha256 = $hashResult.Hash.ToLower()
$shaFile = "$InstallerPath.sha256"
"$sha256  $($installerItem.Name)" | Out-File -FilePath $shaFile -Encoding utf8
Write-Host "      ✓ SHA-256: $sha256" -ForegroundColor Green
Write-Host "      ✓ Generated checksum file: $shaFile" -ForegroundColor Green

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

# 5. Create GitHub Release
Write-Host "[5/7] Creating GitHub Release on $Repo..." -ForegroundColor Yellow
$releaseTitle = "Quantum IDE $Version (Friends Beta)"

gh release create $Version $InstallerPath $shaFile `
    --repo $Repo `
    --title $releaseTitle `
    --notes $notesContent `
    --prerelease

if ($LASTEXITCODE -ne 0) {
    throw "Failed to create GitHub release on $Repo."
}
Write-Host "      ✓ GitHub Release created and assets uploaded." -ForegroundColor Green

# 6. Update Release Manifest
Write-Host "[6/7] Updating Release Manifest (channels/friends-beta/windows-x64.json)..." -ForegroundColor Yellow
$manifestPath = Join-Path $RepoRoot "channels\friends-beta\windows-x64.json"
$manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json

$downloadUrl = "https://github.com/$Repo/releases/download/$Version/$($installerItem.Name)"
$releaseNotesUrl = "https://github.com/$Repo/releases/tag/$Version"

$manifest.version = $Version
$manifest.updateClass = $UpdateClass
$manifest.publishedAt = [DateTime]::UtcNow.ToString("o")
$manifest.available = $true
$manifest.downloadUrl = $downloadUrl
$manifest.fileName = $installerItem.Name
$manifest.sizeBytes = $installerItem.Length
$manifest.sha256 = $sha256
$manifest.releaseNotesUrl = $releaseNotesUrl

$manifest | ConvertTo-Json -Depth 5 | Out-File -FilePath $manifestPath -Encoding utf8
Write-Host "      ✓ Manifest updated with live asset coordinates." -ForegroundColor Green

# 7. Commit & Push Manifest Update
Write-Host "[7/7] Committing and pushing manifest update..." -ForegroundColor Yellow
Push-Location $RepoRoot
try {
    git add "channels/friends-beta/windows-x64.json"
    git commit -m "release(friends-beta): publish Quantum IDE $Version for windows-x64"
    git push origin main
    Write-Host "      ✓ Pushed to repository. GitHub Pages will auto-deploy the update." -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "   Quantum IDE Release $Version Published Successfully!  " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "• Direct Download URL : $downloadUrl" -ForegroundColor Cyan
Write-Host "• SHA-256 Checksum    : $sha256" -ForegroundColor Cyan
Write-Host "• Release Notes       : $releaseNotesUrl" -ForegroundColor Cyan
Write-Host "• Distribution Portal : https://Quantum-IDE.github.io/quantum-ide-distribution/`n" -ForegroundColor Cyan
