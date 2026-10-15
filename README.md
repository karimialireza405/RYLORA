# RYLORA

**Feel Every Note.** A premium, offline-first desktop music player for Windows.

RYLORA plays the music already on your computer — MP3, FLAC, WAV, OGG Vorbis and
AAC (.m4a) — in an artwork-led, cinematic interface. Nothing is uploaded, nothing
is tracked.

## Highlights

* **Real playback engine** in Rust (rodio + symphonia) on its own thread:
  **gapless playback**, **volume levelling** (ReplayGain tags or an on-device
  EBU R128 measurement, per song or per album), optional **crossfade** that skips
  the silence between songs, a **10-band equalizer** with presets, **output device
  selection** that follows Windows when you plug in headphones, race-free state
  transitions, an editable queue, error recovery and session resume.
* **Live spectrum visualizer** computed by FFT from the samples actually being
  played — no decorative fake waveforms.
* **Local library** with incremental background scanning, embedded artwork,
  accent colours extracted from covers, missing-file tracking, favourites,
  listening history and playlists (drag to reorder).
* **Now Playing** and full-window **Immersive mode** lit by the album art.
* **Fast local search** across songs, albums, artists and playlists.
* **Keyboard-first**: global shortcuts (press `?` in the app), accessible menus,
  visible focus, reduced-motion support.
* **Persian and English interface**: Persian by default, with a right-to-left
  layout, Persian digits and Solar Hijri dates; switch in Settings → Language.
* **Windows-native touches**: custom title bar with standard window behaviour,
  native file/folder pickers, drag & drop, single instance, remembered window
  size, Windows media keys and media flyout (title, cover, timeline,
  play/pause/next/previous).

## Quick start

```bash
npm install
npm run app:dev
```

Then choose **Add music** in the sidebar (or press **Ctrl+O**). Choose individual
music files or a folder including its subfolders. File imports preserve current
playback and offer **Play now** and **View songs** when finished. You can also
drop files or folders onto the window. Covers are presented as paper record
sleeves with a matching vinyl disc, following the supplied reference.

Embedded cover art is preferred; files without it can use a local `cover.jpg`,
`folder.png`, `front.webp`, or a picture with the same filename as the song.

To try it
without your own music, generate an original test library first:

```bash
python scripts/generate-test-media.py test-media
```

Build an installer:

```bash
npx tauri build --bundles nsis
```

The installer is written to `src-tauri/target/release/bundle/nsis/`.

## Project layout

```
src/                 React + TypeScript frontend
  app/               bootstrap, routing
  components/        design-system primitives, layout, feedback
  features/          home, library, albums, artists, playlists, search,
                     player (now playing, immersive), queue, visualizer, settings
  services/backend/  typed IPC layer (the only path to the backend)
  stores/            Zustand stores
src-tauri/           Rust backend
  src/domain/        queue rules, models (pure, unit-tested)
  src/application/   player & library services
  src/audio/         AudioBackend trait, playback stream, EQ, loudness, FFT
  src/library/       path identity, scanner
  src/metadata/      tags, artwork, accent colours
  src/database/      SQLite migrations & repositories
  src/system/        artwork protocol, Windows media controls
  migrations/        SQL schema
docs/                architecture, design system, setup, roadmap
scripts/             test-media generator
```

## Documentation

* [Architecture](docs/architecture/overview.md)
* [Design system](docs/design-system/overview.md)
* [Development setup & verification](docs/development/setup.md)
* [Roadmap & known limitations](docs/development/roadmap.md)

## Tech

Tauri 2 · Rust · rodio/symphonia · lofty · SQLite (rusqlite) · React 19 ·
TypeScript (strict) · Vite · Tailwind CSS 4 · Radix UI · Motion · Zustand ·
TanStack Virtual · Lucide · Urbanist & Vazirmatn (bundled, SIL OFL).
