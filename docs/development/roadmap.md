# Roadmap

Status reflects what is implemented and verified, not intentions.

## Done

**Foundation & design system** — Tauri 2 + React 19 + strict TypeScript + Tailwind 4
tokens, bundled fonts, custom title bar, sidebar with animated selection, persistent
playback bar, toasts, dialogs, menus, tooltips, skeletons, empty states.

**Screens** — Home (continue listening, recently played/added, favourites,
playlists, daily picks; onboarding when empty) · Songs / Albums / Artists /
Favorites / Recently Added · Album · Artist (incl. "Appears on") · Playlists &
Playlist detail · Search · Queue panel · Now Playing · Immersive mode · Settings.

**Audio engine** — rodio + symphonia behind `AudioBackend`; play/pause/seek/next/
previous/volume/mute/shuffle/repeat; queue editing; error skip; device-loss
recovery; seek timeout guard; real FFT spectrum visualizer.

**Library** — folder add/remove (with confirmation), incremental background scan,
lofty metadata with fallbacks, artwork cache + accent extraction, missing-file
tracking, loose-file import (open files / drag & drop), favourites, play history.

**Persistence** — SQLite with migrations; playlists (create, rename, delete,
add, remove, reorder), favourites, history, preferences, playback session.

**Windows integration** — single instance, window size/position memory, native
dialogs, drag & drop, NSIS installer. System Media Transport Controls (media keys,
Windows media flyout with artwork and timeline) are implemented and compile;
**runtime verification is pending** (see Known limitations).

**Lyrics** — embedded unsynchronised lyrics (ID3 USLT, Vorbis LYRICS, MP4 ©lyr).

## Next

1. **Gapless playback** — pre-append the next source to the same rodio `Player`
   (or a dedicated symphonia → cpal pipeline) and verify sample-accurate joins.
2. **Equalizer** — a real biquad filter chain in the `TapSource` path; the UI will
   only appear once it affects audio.
3. **Output device selection** — enumerate cpal devices; persist the choice.
4. **File watching** — `notify` crate to pick up changes without a rescan.
5. **Synced lyrics** (LRC sidecars / SYLT) with highlighted lines.
6. **Tray icon** with transport controls and close-to-tray option.
7. **Smart collections** — most played, never played, by genre/decade.
8. **Large-library tuning** — measure 50k+ tracks; consider paging the snapshot
   and FTS5 search if the in-memory approach shows strain.
9. **Code signing** for the installer (requires a certificate).

## Known limitations

* Not gapless; no ReplayGain; no EQ; default output device only.
* Opus is not supported (symphonia 0.5 has no Opus decoder).
* The library snapshot is loaded whole into the UI — fine for tens of thousands
  of tracks, not yet measured beyond that.
* The Windows media flyout timeline updates on state changes (play/pause/seek/
  track change), not continuously.
* Installer is unsigned (SmartScreen will warn).
* Media keys / Windows media flyout (SMTC) have not yet been exercised in a
  running build.
