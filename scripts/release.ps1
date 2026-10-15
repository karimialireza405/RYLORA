# Build a release of RYLORA ready to publish: a (code-signed, if configured) NSIS
# installer, its updater signature, and the `latest.json` manifest the app checks.
# Nothing is uploaded — publish the files in the output folder yourself.
#
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 `
#       -UpdateEndpoint "https://example.com/rylora/latest.json" `
#       -DownloadBaseUrl "https://example.com/rylora/0.2.0" `
#       -Notes "What changed"
#
# Requires the updater private key (see docs/development/releasing.md):
#   TAURI_SIGNING_PRIVATE_KEY           key text or path (default: ~/.tauri/rylora-updater.key)
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  its password, if it has one
# Code signing is optional and configured as described in scripts/sign.ps1.
param(
    [Parameter(Mandatory = $true)][string]$UpdateEndpoint,
    [Parameter(Mandatory = $true)][string]$DownloadBaseUrl,
    [string]$Notes = "",
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$conf = Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $conf.version
$product = $conf.productName

if (-not $UpdateEndpoint.StartsWith("https://")) { throw "The update address must use https." }
if (-not $DownloadBaseUrl.StartsWith("https://")) { throw "The download address must use https." }

if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    $default = Join-Path $HOME ".tauri\rylora-updater.key"
    if (-not (Test-Path $default)) { throw "No updater signing key: set TAURI_SIGNING_PRIVATE_KEY or create $default." }
    $env:TAURI_SIGNING_PRIVATE_KEY = $default
}
if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "" }

# The update address is compiled into the app.
$env:RYLORA_UPDATE_ENDPOINT = $UpdateEndpoint

# Updater artifacts (the installer's .sig) are only produced for releases.
$extraConfig = Join-Path ([IO.Path]::GetTempPath()) "rylora-release.conf.json"
'{"bundle":{"createUpdaterArtifacts":true}}' | Set-Content $extraConfig -Encoding ascii
Push-Location $root
try {
    npx tauri build --bundles nsis --config $extraConfig
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed (exit $LASTEXITCODE)." }
} finally {
    Pop-Location
    Remove-Item $extraConfig -ErrorAction SilentlyContinue
}

$bundle = Join-Path $root "src-tauri\target\release\bundle\nsis"
$installerName = "${product}_${version}_x64-setup.exe"
$installer = Join-Path $bundle $installerName
$signature = "$installer.sig"
if (-not (Test-Path $installer) -or -not (Test-Path $signature)) { throw "Expected $installerName and its .sig in $bundle." }

if (-not $OutDir) { $OutDir = Join-Path $root "release\$version" }
New-Item -ItemType Directory -Force $OutDir | Out-Null
Copy-Item $installer, $signature $OutDir -Force

$manifest = [ordered]@{
    version   = $version
    notes     = $Notes
    pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = (Get-Content $signature -Raw).Trim()
            url       = "$($DownloadBaseUrl.TrimEnd('/'))/$installerName"
        }
    }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $OutDir "latest.json") -Encoding utf8

$auth = Get-AuthenticodeSignature $installer
Write-Host ""
Write-Host "Release $version written to $OutDir"
Write-Host "  installer : $installerName ($([math]::Round((Get-Item $installer).Length / 1MB, 2)) MB)"
Write-Host "  code sign : $($auth.Status) $($auth.SignerCertificate.Subject)"
Write-Host "Upload the installer to $DownloadBaseUrl and latest.json to $UpdateEndpoint."
