# happy-update.ps1 — rebuild the selfhost Tauri installer and apply it in place.
# Run from the happy-app directory (or anywhere — $PSScriptRoot keeps paths correct).

$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

# 1. Build the selfhost installer.
Write-Host "`n[1/3] Building selfhost installer..." -ForegroundColor Cyan
pnpm tauri:build:selfhost

# 2. Find the NSIS installer in the bundle output dir.
Write-Host "`n[2/3] Locating installer..." -ForegroundColor Cyan
$bundleDir = Join-Path $PSScriptRoot "src-tauri\target\release\bundle\nsis"
$installer  = Get-ChildItem -Path $bundleDir -Filter "*-setup.exe" | Select-Object -First 1
if (-not $installer) {
    Write-Error "No installer found in $bundleDir — build may have failed."
}
Write-Host "Found: $($installer.FullName)"

# 3. Run the installer silently to update Happy in place.
Write-Host "`n[3/3] Installing..." -ForegroundColor Cyan
Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait
Write-Host "`nHappy updated successfully." -ForegroundColor Green
