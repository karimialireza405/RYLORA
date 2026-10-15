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
  implementation, `RodioBackend`, uses rodio 0.23 + symphonia 0.5.
* **One continuous stream per output** (`audio/engine.rs`). Each open device gets a
  single long-lived `rodio::Player` carrying one `PlaybackSource`. Tracks are
  decoded with symphonia's gapless mode (encoder delay/padding trimmed), converted
  to the device's channels and sample rate, and swapped *inside* that stream:
  * **Gapless:** the player thread keeps the next entry prepared
    (`PlayQueue::peek_next` → `AudioBackend::set_next`); when the current track's
    last sample is pulled, the audio thread continues with the prepared track on
    the very next frame and reports a transition. The queue then follows the audio
    (`take_transition` → `jump_to`). Queue edits, shuffle and repeat changes
    re-prepare the next track; repeat-one loops gaplessly.
  * **Equalizer** (`audio/eq.rs`): 10 RBJ biquads (low shelf 31 Hz, peaking
    62 Hz–8 kHz, high shelf 16 kHz, ±12 dB) plus preamp, with a soft limiter above
    0.9 FS. Settings reach the audio thread through a versioned `EqControl`; a flat
    or disabled EQ is bit-transparent. Persisted under the `equalizer` setting.
  * **Spectrum:** the stream copies a mono downmix of what is heard (after EQ,
    before volume) into the analyser ring. A 2048-point FFT at ~30 Hz drives the
    visualizer, seek ribbon and cover pulse, only while something displays them.
  * **Silence when idle:** the stream never ends, so the output stays open and
    position is tracked by the stream itself (frames since the track started).
* **Output devices:** cpal device ids (stable across restarts) are listed and the
  choice persists (`outputDevice`). "System default" follows Windows: the backend
  polls the default every 3 s and moves playback when it changes. Switching or
  losing a device reopens the output and resumes the same track at the same
  position, including its prepared successor.
* **Format quirk handled:** `UniformSourceIterator` treated Vorbis' zero-length
  first span as end-of-file, so OGG played 0 s after resampling. `SteadySpan`
  presents each file as one span; chained Ogg streams that change sample rate
  mid-file are not supported.
* **Seek safety:** rodio's `try_seek` blocks until the audio callback applies it,
  so it runs on a helper thread with a 1.5 s timeout — a stalled/unplugged device
  can never hang the player thread.
* **Session persistence:** queue, cursor, position, volume, mute and repeat are
  saved (throttled) and on exit; restored paused on launch.

### Why rodio + symphonia (and not libmpv)

* Pure Rust, no DLL to ship or license-check, small binary.
* Covers the target formats (MP3, FLAC, WAV, OGG Vorbis, AAC/M4A) — all verified.
* Owning the `Source` gives sample-accurate control for gapless switching, the EQ
  and the analyser without an external DSP framework.
* The `AudioBackend` trait still allows libmpv or a direct symphonia → cpal
  pipeline later (e.g. for bit-perfect/exclusive output).

Not claimed: bit-perfect/exclusive (WASAPI exclusive) output, ReplayGain, crossfade.

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
