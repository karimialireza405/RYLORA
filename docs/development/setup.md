# Development setup

## Prerequisites (verified on Windows 11)

| Tool | Version used |
|---|---|
| Node.js / npm | 24.15 / 11.7 |
| Rust (MSVC toolchain) | 1.95 (`rust-version` = 1.82) |
| Visual Studio 2022 Build Tools (C++ workload) | 2022 |
| Microsoft Edge WebView2 Runtime | 155 |
| ffmpeg + Python 3 with numpy & Pillow | *optional*, only to generate test media |

## Commands

```bash
npm install                 # frontend dependencies
npm run app:dev             # run the desktop app with hot reload (tauri dev)
npm run app:build           # release build + installers (tauri build)
npx tauri build --bundles nsis   # NSIS installer only

npm run typecheck           # strict TypeScript (app + vite config)
npm test                    # frontend unit tests (vitest)
cd src-tauri && cargo test  # backend unit tests
cd src-tauri && cargo clippy --all-targets
```

`npm run dev` alone serves the UI at http://localhost:1420. Opened in a normal
browser (not the Tauri window) it uses a **development-only preview backend**
(`src/services/backend/preview.ts`) with a fictional catalogue and no audio, for
layout work at arbitrary viewport sizes. It is excluded from production builds
(verified: the bundle contains none of its data).

Dev builds compile dependencies with `opt-level = 3`
(`[profile.dev.package."*"]`) so decoding and artwork resizing behave
realistically — an unoptimised `image` crate made scans ~10× slower.

## Test media

```bash
python scripts/generate-test-media.py test-media
```

Generates an original, royalty-free library (git-ignored): synthesised music with
painted cover art and real tags in MP3, FLAC, OGG Vorbis, AAC/M4A and WAV, a
Persian-titled album (RTL), a compilation ("Various Artists"), an untagged WAV
and a deliberately corrupt MP3. Add the folder from the app's welcome screen or
Settings → Music library.

## Where data lives

`%APPDATA%\app.rylora.player\` — `rylora.db` (SQLite, WAL) and `artwork\`
(cached covers). Deleting the folder resets RYLORA.

## End-to-end verification performed

Run against the real app (real IPC, real audio device; output muted) through the
WebView2 DevTools protocol (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`):

* Playback: start, progress events, pause holds position, resume, seek forward/
  backward, 15 rapid seeks, next/previous (restart after 3 s), 12 rapid skips
  (deterministic result, single clock: 995 ms per 1000 ms), track-end
  auto-advance, repeat-one, end of queue, queue edits (play next, remove, remove
  current, move, shuffle) — 29/29 passed.
* Real spectrum: 34 frames/s with peak band 246/255 while playing.
* Every format decodes: MP3, FLAC, OGG, M4A, WAV.
* Failure paths: file deleted after indexing → error toast + skip; rescan flags
  it missing and album counts drop; restoring the file keeps its id; corrupt and
  nonexistent files rejected on import; nested folders rejected; blank playlist
  names rejected; invalid IPC arguments rejected.
* Persistence across a graceful restart: queue, track, position (21.6 s), volume,
  mute, repeat, playlists, favourites and history; resume continues from 21.6 s.
* Layout at 1280×720, 1440×900, 1920×1080 with no horizontal overflow.

## Observed performance (this machine, debug build with optimised deps)

* Full scan of 21 files incl. five 1200 px covers: **1.1 s**; unchanged rescan: < 0.1 s.
* Seek latency to audible position: within one 250 ms progress tick.
* Frontend bundle: 665 kB JS (206 kB gzip), 61 kB CSS; fonts ~0.3 MB (subset woff2).
