# Releasing RYLORA

A release is an NSIS installer, an **updater signature** for it, and a small
`latest.json` manifest. Installed copies of RYLORA download the manifest (only when
the user checks, or turned on automatic checks), compare versions, download the
installer, verify it against the public key built into the app, and run it.

`scripts/release.ps1` produces all three files. **It uploads nothing** — you publish
them wherever you host releases.

## One-time setup

### 1. Updater signing key (required)

The keypair was generated with `npx tauri signer generate -w ~/.tauri/rylora-updater.key`.

* `~/.tauri/rylora-updater.key` — **private, never commit or share it.** Back it up
  somewhere safe. If it is lost, installed copies can no longer accept updates and
  users must reinstall manually.
* `~/.tauri/rylora-updater.key.pub` — public; its contents are in
  `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

The current key was created without a password. Before the first public release,
consider replacing it with a password-protected one (nothing trusts the current key
yet, so this is free now and impossible later):

```bash
npx tauri signer generate -w ~/.tauri/rylora-updater.key --force
```

then copy the new `.pub` contents into `plugins.updater.pubkey`, and set
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when releasing.

### 2. Hosting

Any static HTTPS host works (GitHub Releases, a web server, object storage). You need
two addresses:

* the **update address** where `latest.json` will live (stays the same for every
  release, e.g. `https://github.com/<you>/rylora/releases/latest/download/latest.json`);
* the **download address** for this version's installer
  (e.g. `https://github.com/<you>/rylora/releases/download/v0.2.0`).

The update address is compiled into the app. A build made without one (ordinary
`npx tauri build`) says in Settings that it cannot check for updates.

### 3. Code signing (recommended)

Without Authenticode signing, Windows SmartScreen warns when the installer is run.
Signing needs a code-signing certificate from a certificate authority, or a signing
service — this costs money and requires identity verification, so it is your
decision. Options:

| Option | Notes |
|---|---|
| **Azure Trusted Signing** | Monthly subscription; no hardware token; SmartScreen reputation builds quickly. |
| **OV certificate** (.pfx or token) | Annual; SmartScreen warnings fade as downloads build reputation. |
| **EV certificate** (hardware token) | Most expensive; immediate SmartScreen reputation. |

`scripts/sign.ps1` runs automatically for every `tauri build` (configured in
`bundle.windows.signCommand`). With no certificate configured it leaves files
unsigned and says so. Configure **one** of:

```powershell
# a .pfx file
$env:RYLORA_SIGN_PFX = "C:\path\to\certificate.pfx"
$env:RYLORA_SIGN_PFX_PASSWORD = "…"
# or a certificate in the Windows store / on a token
$env:RYLORA_SIGN_THUMBPRINT = "<sha1 thumbprint>"
# or Azure Trusted Signing
$env:RYLORA_SIGN_DLIB = "C:\path\to\Azure.CodeSigning.Dlib.dll"
$env:RYLORA_SIGN_DMDF = "C:\path\to\metadata.json"
```

Signatures are timestamped (`RYLORA_SIGN_TIMESTAMP`, default DigiCert) so they stay
valid after the certificate expires. `signtool.exe` comes from the Windows SDK.

## Making a release

1. Raise `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
   `package.json`.
2. Run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 `
       -UpdateEndpoint "https://…/latest.json" `
       -DownloadBaseUrl "https://…/v0.2.0" `
       -Notes "What changed in this version"
   ```

3. Upload from `release/<version>/`: the installer to the download address and
   `latest.json` to the update address. (`release/` is ignored by git.)

## Verified (2026-10-16)

* `scripts/release.ps1` with a throwaway self-made certificate produced an
  Authenticode-signed installer (status "UnknownError" only because the test
  certificate is not trusted — a CA certificate removes that), its `.sig`, and
  `latest.json`.
* A development build pointed at a local server found the newer version, downloaded
  it and accepted it; the same download with one byte changed was rejected by the
  signature check. Installation itself (running the NSIS installer) was not
  exercised in that test, to avoid installing software on the development machine.
