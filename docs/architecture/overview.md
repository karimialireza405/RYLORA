# RYLORA — Architecture

RYLORA is a **modular monolith**: one Tauri 2 process with a Rust backend and a
React/TypeScript frontend, organised by responsibility rather than by framework.

```
┌──────────────────────── Frontend (WebView2) ─────────────────────────┐
│ Presentation   components/ui · components/layout · features/*        │
│ State          stores/ (Zustand) — mirrors backend state, UI state   │
│ Service        services/backend — the ONLY door to the backend       │
└─────────────────────────────┬─────────────────────────────────────────┘
                 typed commands │ ▲ typed events (player://*, library://*)
┌─────────────────────────────▼─┴──────────────── Backend (Rust) ──────┐
│ commands/      thin IPC adapters, input validation                   │
│ application/   PlayerService (actor thread) · LibraryService         │
│ domain/        models, PlayQueue (shuffle/repeat rules), PRNG — pure │
│ audio/         AudioBackend trait · rodio impl · sample tap · FFT    │
│ library/       canonical paths · incremental scanner                 │
│ metadata/      lofty tags · artwork resize/cache · accent colour     │
│ database/      SQLite (rusqlite), migrations, repositories           │
│ system/        artwork:// protocol · Windows media controls (SMTC)   │
└──────────────────────────────────────────────────────────────────────┘
```

## Ownership of state

| State | Owner | Frontend view |
|---|---|---|
| Playback (status, position, volume, queue, shuffle, repeat) | Rust player thread | `stores/player.ts` mirrors `player://state`; position in a separate `useProgress` store |
| Library, playlists, favourites, history | SQLite | `stores/library.ts` cache, refreshed on `library://changed` |
| Preferences | SQLite `settings` table (whitelisted keys) | `stores/ui.ts` `prefs` |
| Navigation, dialogs, panels | Frontend only | `stores/navigation.ts`, `stores/ui.ts` |

The frontend never decides playback outcomes; it sends intents (`player.next()`)
and renders the snapshot the backend emits.

## Playback engine

* **One player thread** (`application/player.rs`) owns the `PlayQueue` and the
  `AudioBackend`. Commands arrive over a crossbeam channel and are processed
  strictly in order — rapid skips/seeks cannot race (verified: 12 queued skips
  land on a deterministic track with a single playback clock).
* **`AudioBackend` trait** (`audio/mod.rs`) isolates the engine. The current
  implementation, `RodioBackend`, uses rodio 0.23 + symphonia 0.5 and creates one
  `rodio::Player` per track (dropping it stops the previous track immediately).
* **Seek safety:** rodio's `try_seek` blocks until the audio callback applies it,
  so it runs on a helper thread with a 1.5 s timeout — a stalled/unplugged device
  can never hang the player thread.
* **Device loss:** a cpal error callback flags the sink; the next load reopens the
  default output device.
* **Visualizer:** `TapSource` copies a mono downmix of the *decoded audio actually
  being pulled by the device* into a ring buffer (batched, `try_lock`, never
  blocks the audio thread). The player thread runs a 2048-point FFT at ~30 Hz,
  maps 64 log-spaced bands to 0–255 and emits `player://spectrum` — only while a
  visualizer is mounted (reference-counted), and it stops emitting once the bars
  settle while paused.
* **Session persistence:** queue, cursor, position, volume, mute and repeat are
  saved (throttled) and on exit; restored paused on launch.

### Why rodio + symphonia (and not libmpv)

* Pure Rust, no DLL to ship or license-check, small binary.
* Covers the target formats (MP3, FLAC, WAV, OGG Vorbis, AAC/M4A) — all verified.
* A `Source` wrapper gives direct sample access for the real-time spectrum.
* The `AudioBackend` trait keeps libmpv (or a custom symphonia→cpal pipeline for
  gapless/bit-perfect output) as a drop-in replacement if DSP needs grow.

Not claimed: gapless playback, bit-perfect/exclusive output, DSP/EQ.

## Library indexing

* `library/paths.rs` defines file identity: canonical path with the `\\?\` prefix
  stripped, `/`→`\`, trailing slash removed, lower-cased on Windows. The DB
  enforces `UNIQUE(path_key)`; re-indexing a file keeps its id, so favourites,
  playlists and history survive tag edits.
* `library/scanner.rs` runs on its own thread and DB connection (WAL mode).
  Unchanged files (same size + mtime) are skipped without reading tags; vanished
  files are flagged `missing` (never deleted) and un-flagged when they return;
  unreachable folders (e.g. unplugged drive) flag their tracks missing.
* Nested/overlapping library folders are rejected to avoid double indexing.
* Artwork is content-addressed (BLAKE3), resized to 640 px and 192 px JPEGs, and
  served by the narrow `artwork://` protocol (`/<32 hex>/<sm|lg>` only).
* Accent colours are extracted in Rust and lightened until they reach ≥ 4.6:1
  contrast on the app background (unit-tested for every hue).

## Security posture

* Capabilities (`src-tauri/capabilities/default.json`): core window controls,
  event listening and the dialog plugin only. **No fs, shell or http plugins.**
* All file access happens in Rust; paths from the UI come only from native
  dialogs, drag-and-drop or the library.
* CSP restricts scripts to the bundle; images to self/data/artwork protocol.
* No network requests, no telemetry.
* `unsafe` is used exactly once: the documented COM interop call
  `ISystemMediaTransportControlsInterop::GetForWindow` (see `system/media_controls.rs`).

## Tests

* Rust (`cargo test`, 34 tests): queue/shuffle/repeat rules, FFT and band mapping,
  path identity, accent contrast, migrations, repositories (identity, playlists,
  cascades, compilations, missing files), metadata fallbacks.
* Frontend (`npm test`, 24 tests): formatting, RTL detection, sorting, search ranking,
  personal music import, duplicate handling and refresh/scan completion.
* End-to-end checks against the real app (see `docs/development/setup.md`).
