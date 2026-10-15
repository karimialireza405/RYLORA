# Authenticode signing hook for `tauri build` (bundle.windows.signCommand).
#
# Signs the given file when a certificate is configured through environment
# variables, and leaves it unsigned (with a notice) otherwise, so ordinary local
# builds keep working. Configure exactly one of:
#
#   RYLORA_SIGN_PFX + RYLORA_SIGN_PFX_PASSWORD   a .pfx code-signing certificate file
#   RYLORA_SIGN_THUMBPRINT                       a certificate in the Windows store
#                                                (e.g. on a hardware token / EV)
#   RYLORA_SIGN_DLIB + RYLORA_SIGN_DMDF          Azure Trusted Signing (dlib + metadata json)
#
# Optional: RYLORA_SIGN_TIMESTAMP — RFC 3161 timestamp server
#           (default http://timestamp.digicert.com; "none" skips timestamping).
#           RYLORA_SIGNTOOL — path to signtool.exe (found in the Windows SDK otherwise).
param([Parameter(Mandatory = $true)][string]$File)

$ErrorActionPreference = "Stop"

$hasPfx = [bool]$env:RYLORA_SIGN_PFX
$hasThumb = [bool]$env:RYLORA_SIGN_THUMBPRINT
$hasDlib = [bool]$env:RYLORA_SIGN_DLIB
if (-not ($hasPfx -or $hasThumb -or $hasDlib)) {
    Write-Host "sign.ps1: no certificate configured; $([IO.Path]::GetFileName($File)) is left unsigned."
    exit 0
}

$signtool = $env:RYLORA_SIGNTOOL
if (-not $signtool) {
    $signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match "\\x64\\" } | Sort-Object FullName | Select-Object -Last 1 -ExpandProperty FullName
}
if (-not $signtool -or -not (Test-Path $signtool)) {
    throw "sign.ps1: signtool.exe not found. Install the Windows SDK or set RYLORA_SIGNTOOL."
}

$signArgs = @("sign", "/fd", "SHA256")
if ($hasPfx) {
    $signArgs += @("/f", $env:RYLORA_SIGN_PFX)
    if ($env:RYLORA_SIGN_PFX_PASSWORD) { $signArgs += @("/p", $env:RYLORA_SIGN_PFX_PASSWORD) }
} elseif ($hasThumb) {
    $signArgs += @("/sha1", $env:RYLORA_SIGN_THUMBPRINT)
} else {
    $signArgs += @("/dlib", $env:RYLORA_SIGN_DLIB, "/dmdf", $env:RYLORA_SIGN_DMDF)
}
$timestamp = if ($env:RYLORA_SIGN_TIMESTAMP) { $env:RYLORA_SIGN_TIMESTAMP } else { "http://timestamp.digicert.com" }
if ($timestamp -ne "none") {
    $signArgs += @("/tr", $timestamp, "/td", "SHA256")
}
$signArgs += @("/d", "RYLORA", $File)

& $signtool @signArgs
if ($LASTEXITCODE -ne 0) {
    throw "sign.ps1: signtool failed for $File (exit $LASTEXITCODE)."
}
Write-Host "sign.ps1: signed $([IO.Path]::GetFileName($File))"
