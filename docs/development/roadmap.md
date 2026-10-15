# Roadmap

Status reflects what is implemented and verified, not intentions. Per-iteration
notes live next to this file (`*-2026-10-1x.md`).

## Done

**Foundation & design system** — Tauri 2 + React 19 + strict TypeScript + Tailwind 4
tokens, bundled Italiana, Marcellus and Vazirmatn fonts with a layered glow system, custom title bar, Studio layout with
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
**Folder watching** (on by default, Settings → Library): songs added, changed,
moved or deleted in library folders appear within seconds while RYLORA is open —
changes are collected until the folder is quiet for 2 s, then one incremental scan
runs. Verified 2026-10-16: a copied song appeared 2.1 s later; deleting it marked it
missing 2.4 s later.

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

**Lyrics** — synced lyrics from a `.lrc` file beside the song (UTF-8/UTF-16 or
Windows-1256, offsets, enhanced word timings stripped), an ID3 SYLT frame, or LRC
text inside the lyrics tag; plain lyrics otherwise (USLT, Vorbis LYRICS, MP4 ©lyr).
The current line is lit and kept centred, following the playing position between
progress updates; clicking a line jumps there; scrolling by hand pauses following
for 4 s. Verified 2026-10-16 in the running app with a mixed Persian/English `.lrc`.

**Updates** — signed updates through Tauri's updater: check on demand or
automatically at launch (off by default), download with progress, verification
against the public key built into the app, then the installer runs and RYLORA
restarts. `scripts/release.ps1` builds the installer, its signature and
`latest.json`; nothing is uploaded. Verified 2026-10-16 against a local server: a
genuine update downloaded and verified; a one-byte-modified download and a manifest
announcing a different version than the signed one were both rejected. See
[releasing.md](releasing.md).

**Code signing pipeline** — `scripts/sign.ps1` signs the app, the NSIS plugins and
the installer during `tauri build` when a certificate (`.pfx`, Windows store /
token, or Azure Trusted Signing) is configured, and leaves them unsigned otherwise.
Verified with a throwaway self-made certificate; a trusted certificate is still to
be acquired (see Next).

## Next

1. **Publishing decisions** (yours): a code-signing certificate or Azure Trusted
   Signing, and a host for releases; then a password-protected updater key. See
   [releasing.md](releasing.md).
2. **WASAPI exclusive / bit-perfect output** (would need a direct cpal path).
3. **Tray icon** with transport controls and close-to-tray option.
4. **Smart collections** — never played, by genre/decade.
5. **Large-library tuning** — measure 50k+ tracks; consider paging the snapshot
   and FTS5 search if the in-memory approach shows strain.
6. **Bundle size** — split rarely used routes (frontend JS is ~735 kB before gzip).

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
* Folder watching works while RYLORA is open; changes made while it is closed are
  picked up by the scan at launch. Replacing cover-image files alone does not
  trigger a rescan.
* Persian lyrics files in Windows-1256 use the Arabic forms of ی and ک, as that code
  page has no Persian letters; they are shown as stored.
* Updates need a release host and signing decisions before they can be used; until
  then builds say they cannot check for updates. The installer step of an update
  (running NSIS) was not exercised in testing, to avoid installing software on the
  development machine.
* The installer is not yet signed with a trusted certificate (SmartScreen will
  warn).
* Error messages produced by the Rust backend are English in both languages.
