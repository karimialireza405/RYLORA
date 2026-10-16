# RYLORA Studio design system

The implemented direction is **Studio**. This is a functional desktop music library, with a neutral graphite palette, compact content and an optional listening sidebar. The product uses its existing React/Radix primitives; it does not import or claim Spotify's proprietary design system.

## Structure

- 220px navigation rail; 56px global search/window bar; 88px persistent transport.
- Listening sidebar on viewports of at least 1320px, default width 320px, resizable from 280px to 400px. Width and visibility persist. Its tabs are Now playing, Queue and Info. Narrow screens retain the existing 300px queue. Home, full player and settings use the wider main area; Home avoids duplicating its featured record in a listening sidebar. Queue remains accessible from the transport.
- Home has two primary sections: one continuation card and a single shelf of up to four other recently added albums. The content is capped at 1280px with 32px side padding, a 28px header gap and 32px between sections. The continuation artwork is 240px wide, reducing to 180px on smaller content widths; records switch from four to two columns. The repeated collection tabs, history table and playlist shelf are removed from Home; sidebar navigation and Browse library retain access to them.
- Continue listening uses the restored playable current track, then actual playback history, then the newest available song. Its album is excluded from the shelf to avoid repetition. The action resumes/pauses current playback or starts the selected record. Empty and unavailable libraries have honest import/reconnect states. No invented recommendations, accounts or streaming capabilities.
- Songs and albums have independently saved grid/list views. Song sorting includes actual play counts; album sorting includes title, artist and date added. Pinned albums appear in the navigation rail.
- Album, artist, playlist, search, settings and import views share the same type, control and colour tokens.

## Typography

**Peyda** (Fontiran, proprietary — see `src/assets/fonts/peyda/FontLicense.txt`; a software licence code must be entered there before distribution) sets all Persian text, in weights 100–700. **Italiana** (high-contrast, serif-less display face by Santiago Orozco) sets page and player titles and the wordmark; **Marcellus** (flared, by Astigmatic) sets all other Latin text — together they follow the "modern minimalist" display style the user chose (their reference was the commercial *Vorage* face, which has no licence here and no Persian glyphs; dropping a licensed Vorage file in later is a one-token change in `--font-display`). Both have a single weight, so emphasis comes from size, colour and glow rather than bold. **Vazirmatn** remains only as a fallback. Clocks and counters (`.tabular`) use fixed-width digits from Segoe UI (Latin, via the local "Rylora Numerals" face) and Vazirmatn (Persian), since Marcellus has proportional digits. All fonts are bundled (Italiana, Marcellus and Vazirmatn under SIL OFL; licences in `Italiana-OFL.txt`, `Marcellus-OFL.txt`; Peyda under its own licence).

**Glow.** Titles (`h1`, `h2`, `.font-display`, the wordmark) carry a layered silver halo (`--glow-title`); live elements glow in the playing song's cover colour (`--now-tint`, set by the player store): the current page in the sidebar, the main play button (which breathes while playing), slider fills and thumbs, the timeline, the current lyric line, and a thin light along the top of the player bar. Switches, active tabs and focus rings glow in silver. The wordmark and play button animate only when motion is allowed.

## Palette and verified contrast

Surfaces: #111112, #141415, #1a1a1c, #242426, #303033. The Silver Graphite theme uses #c1c7d2 for state accents, #e8ebf0 for primary controls, and #f8f9fc on hover. The legacy blue/violet token names alias these central neutral accent tokens. Text glow, selection, focus, navigation markers, tabs, sliders and transport use silver. Artwork-derived visualization colours remain independent. Error/warning/success colours retain semantic meaning.

| Text | Main | Sidebar | Card | Hover | Input |
|---|---:|---:|---:|---:|---:|
| Primary #f5f5f6 | 17.32 | 16.90 | 15.95 | 14.22 | 12.07 |
| Secondary #c6c6ca | 11.08 | 10.81 | 10.20 | 9.10 | 7.73 |
| Metadata #a4a4ac | 7.62 | 7.44 | 7.02 | 6.26 | 5.32 |
| Caption #9797a0 | 6.52 | 6.36 | 6.00 | 5.35 | 4.54 |
| Accent #e8ebf0 | 15.79 | 15.41 | 14.54 | 12.97 | 11.01 |

These are WCAG luminance calculations for the specified solid token pairs, not a claim of a complete accessibility audit.

## Components and motion

- Radix dialogs retain focus trapping, dismissal and accessible labels; sliders retain keyboard control and value text.
- Add music reports newly added and existing songs separately, retains unreadable-file details, and exposes folder scan progress, cancellation and summary. Dropping audio imports without replacing playback.
- LibraryCover consistently renders a sleeve with an exposed black record. Songs, albums, playlists, search results, queue, transport and editing previews share this treatment at proportional sizes. Playlist mosaics sit inside the sleeve. Artist portraits retain their circular portrait treatment. Settings describes the shared record presentation; the former artwork-style selector is removed.
- Record cards have exposed artwork and labels rather than another enclosing surface. Hover and keyboard focus reveal the play button. Active navigation has a quiet surface with a narrow silver marker.
- Listening tabs support arrow keys, Home and End; the focusable resizing separator supports left/right arrows in 16px steps. There is one scrubber while browsing.
- Track table selection retains Ctrl/Shift and keyboard behavior. Pointer transfers send selected playable tracks to an existing sidebar playlist or Queue; queue/playlist reordering remains available.
- Edit song information is available in track menus and Info. It supports title, artist, album, album artist, year, genre and a selected local cover. Library edits persist through rescans using migration 002. Writing file tags requires the user's explicit checkbox; changes are prepared and verified on a sibling copy before replacement.
- The real FFT visualizer and seek ribbon share the current cover's extracted accent colour. Artwork lighting remains user-controlled.
- Reduced-motion support remains in both CSS and Motion.

## Glow and audio motion: 2026-10-15

- Library view tabs use open underline navigation. Search, sorting and grid/list controls share one aligned toolbar; the duplicate result count is removed. Counts appear once in the page header.
- Artwork has an exterior light halo; vinyl stages have an artwork-tinted radial glow, with slow breathing while playing. Glow is painted outside the image without altering the user's cover art.
- The playing cover and transport thumbnail swell on real musical attacks. Weighted positive spectral flux detects attacks across bass and midrange, with an adaptive threshold and a 180ms retrigger guard. A damped spring interpolates motion at display refresh rate, capped at scale 1.08; no periodic beat is generated. Pausing settles to 1 in 200ms. Reduced motion disables the pulse; hidden/offscreen covers suspend their frame loop. The effect is independent of spectrum visibility and never reflows text or controls. See the [smooth pulse validation](../development/smooth-cover-pulse-2026-10-15.md).
- WaveformSeek replaces the straight seek fill with three moving luminous curves, a position beacon and light dots. Radix retains pointer, touch and keyboard seeking, accessible values and cancellation. This is a decorative reactive seek ribbon, not a decoded whole-track waveform.
- The spectrum is a perspective point-cloud field: 22 rows of 160 points in the main player, 12×64 in the compact panel. Smoothed native 64-band FFT energy shapes a moving terrain, with a bright front ridge, floor reflection, low atmospheric light, beat-driven elliptical ripples and individual high-rising motes. No spectrum bars or particle tails remain. The field, glow, motes, seek ribbons and seek beacon use the current cover's extracted accent; highlights are a lighter tint of that same colour. Library cover edits update the colour during playback. Missing/invalid accents fall back to pearl #d7eee9; monochrome covers use the backend's grey-blue accent. Surface folds add spatial motion to measured spectral energy, not a literal audio waveform or substitute audio signal.
- Canvas drawing is capped at 60 frames/second for the spectrum and 30 for seeking, with device pixel ratio at 2. Floating motes are capped at 84 (28 compact), ripples at 3 and timeline particles at 16. Glow sprites are cached per colour to avoid expensive live blur filters. Render loops stop when paused/settled, offscreen or hidden, and are cleaned up on unmount.
- Reduced motion retains a static seek ribbon and removes the moving spectrum/particles. Existing visualizer preferences remain active.

See the [cover colour validation report](../development/cover-colors-implementation-2026-10-15.md). The [record and equalizer report](../development/record-bars-implementation-2026-10-15.md) and actual screenshots of the [library](concepts/record-bars-library-final.png) and [playing screen](concepts/record-bars-player-final.png) document the column geometry before cover-driven colours were enabled. The [earlier glow report](../development/glow-motion-implementation-2026-10-15.md) records the preceding visual iteration.

The current field replaces that earlier column design; see [research, implementation and validation](../development/particle-field-2026-10-15.md) and the [actual player capture](concepts/particle-field-player-final.png).

## Research and selection

See [research and concept comparison](concepts/README.md), [the latest proposed mockup](concepts/studio-next-2026-10-15.png), [its complete prompt](concepts/studio-next-2026-10-15-prompt.md), and [the implementation report](../development/studio-next-implementation-2026-10-15.md).
