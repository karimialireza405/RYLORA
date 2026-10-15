# Cover-driven audio colours — 2026-10-15

At the user's request, the equalizer and seek timeline now follow the characteristic accent already extracted from each cover by the backend. The equalizer retains its vertical columns and flat peaks; particles remain individual high-rising dots without tails.

`usePlaybackAccent` resolves the current track's latest library accent, with the player snapshot as a fallback while the library is unavailable. This also handles artwork edits during playback and explicit removal of an accent. Missing or malformed accents use pearl #d7eee9. AudioScene shares the result across columns, peak markers, glow, dots, seek ribbons and the seek beacon. Colour changes repaint paused scenes as well as playing scenes. The native audio engine, FFT processing and seeking behavior are unchanged.

Validation: the production frontend build and TypeScript checks passed. Four pixel-level checks passed in the running native app, using temporary frontend state only: two real library covers (#e49158 and #ca7372), a library accent edit (#72b5e4), and missing-accent fallback (#d7eee9). Each check verified matching rendered pixels in the spectrum and both mounted seek timelines. The test restored frontend state and did not change the native player, music files or stored metadata.
