# Roadmap

Status reflects what is implemented and verified, not intentions. Per-iteration
notes live next to this file (`*-2026-10-1x.md`).

## Done

**Foundation & design system** — Tauri 2 + React 19 + strict TypeScript + Tailwind 4
tokens, bundled Urbanist and Vazirmatn fonts, custom title bar, Studio layout with
a resizable Listening panel (Now playing / Queue / Info), Silver Graphite palette,
toasts, dialogs, menus, tooltips, skeletons, empty states.

**Language** — complete Persian and English interface (`src/i18n`, Persian is the
default). Persian uses a right-to-left layout, Persian digits and Solar Hijri dates.
Mixed Persian/Latin metadata keeps correct word order and aligns with the interface.
Media controls (transport, timeline, volume) stay left-to-right in both languages,
following established platform convention.

**Screens** — Home (continue listening, recently added) · Songs / Albums / Artists /
Favorites / Recently Added (grid or list, persistent sorting incl. most played) ·
Album · Artist (incl. "Appears on") · Playlists & Playlist detail · Search · Queue ·
Now Playing · Immersive mode · Settings.

**Covers** — paper record sleeve with a matching vinyl disc everywhere; cover-driven
accent colours; audio-reactive cover pulse.

**Audio engine** — rodio + symphonia behind `AudioBackend`, one continuous stream
per output device: **gapless playback** (prepared next track, sample-accurate
switch, encoder padding trimmed; repeat-one loops gaplessly), a real **10-band
equalizer** with presets and preamp, **output device selection** (persisted;
"System default" follows Windows), resume at the same position when the device
changes or fails; play/pause/seek/next/previous/volume/mute/shuffle/repeat; queue
editing; error skip; seek timeout guard; real FFT feeding the visualizer.
Verified 2026-10-15 in the running app: zero reloads at gapless switches, EQ
measurably reshapes the playing signal, switching between four real devices
continues from the same position, and all five formats decode.

**Volume levelling & crossfade** — per-song or per-album levelling to a Quiet /
Normal / Loud target (-23 / -14 / -11 LUFS) from ReplayGain tags or a one-time
EBU R128 measurement on a background thread (current and next song first), never
boosting past a song's peak; gain changes ramp in without clicks. Optional
equal-power crossfade (1–12 s) that ends where the outgoing song's sound ends and
skips the incoming song's leading silence; consecutive songs of one album stay
gapless by default. Verified 2026-10-15 in the running app: the playing signal
moved by -5.2 dB / +4.6 dB as computed for a loud and a quiet song, the Quiet
target lowered it by 9 dB, the crossfade started before a song's 4 s of trailing
silence with no dip in level, album songs stayed gapless and crossfade off
remained gapless.

**Library** — Add music dialog (files or folders, Ctrl+O), drag & drop, incremental
background scan, lofty metadata with fallbacks, sidecar `cover.jpg`/`folder.png`
artwork, missing-file tracking, favourites, play history, album pins, metadata
editor (library-side by default; optional safe write to file tags), library-side
cleanup of download-site adverts and broken Persian encoding in tags.

**Persistence** — SQLite with migrations (001 initial, 002 metadata edits,
003 loudness measurements);
playlists (create, rename, delete, add, remove, reorder), favourites, history,
preferences, playback session.

**Windows integration** — single instance, window size/position memory, native
dialogs, drag & drop, NSIS installer. System Media Transport Controls verified on
2026-10-15 against the running app through the Windows session manager: title,
artist, album, playing state, timeline and cover thumbnail are published, and
Play, Pause, Next and Previous sent through SMTC (the media-key path) drive the
player. The cover previously used a `file:///` URI, which SMTC does not accept; it
now loads through `StorageFile`.

**Lyrics** — embedded unsynchronised lyrics (ID3 USLT, Vorbis LYRICS, MP4 ©lyr).

## Next

1. **WASAPI exclusive / bit-perfect output** (would need a direct cpal path).
2. **File watching** — `notify` crate to pick up changes without a rescan.
3. **Synced lyrics** (LRC sidecars / SYLT) with highlighted lines.
4. **Tray icon** with transport controls and close-to-tray option.
5. **Smart collections** — never played, by genre/decade.
6. **Large-library tuning** — measure 50k+ tracks; consider paging the snapshot
   and FTS5 search if the in-memory approach shows strain.
7. **Bundle size** — split rarely used routes (frontend JS is ~735 kB before gzip).
8. **Code signing** for the installer (requires a certificate).

## Known limitations

* Shared-mode (mixed) output only, not bit-perfect.
* Levelling never boosts a song past its sample peak and has no limiter, so very
  quiet songs with loud peaks stay below the target (e.g. a -22 LUFS song with
  peaks at -4.6 dBFS is raised by 4.6 dB, not 8 dB).
* Without album ReplayGain tags, album loudness is the duration-weighted energy
  mean of the songs' measurements, not a single programme measurement.
* A song plays at the library's typical level until its own measurement arrives
  (about a second for the current song on first play); then it ramps to its value.
* Crossfades rely on the container's duration; if it is wrong, the fade ends early
  or the outgoing song is cut a little before its end.
* Chained Ogg streams that change sample rate mid-file are not supported.
* Opus is not supported (symphonia 0.5 has no Opus decoder).
* The library snapshot is loaded whole into the UI — fine for tens of thousands
  of tracks, not yet measured beyond that.
* The Windows media flyout timeline updates on state changes (play/pause/seek/
  track change), not continuously.
* Error messages produced by the Rust backend are English in both languages.
* Installer is unsigned (SmartScreen will warn).
