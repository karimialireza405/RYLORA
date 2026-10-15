# Record covers and pearl equalizer — 2026-10-15

The user rejected the orange spectrum and the subsequent flowing, tailed form. The final spectrum uses narrow vertical pearl-white columns, small separated flat peak markers, and individual round light particles. No continuous spectrum outline or particle tails remain. The animated seek ribbon keeps its existing curve-based seeking interaction.

## Implementation

- AudioScene uses native 64-band FFT values, attack/release smoothing, and perceptual gain for 80 columns (28 in the compact listening panel). Colour is fixed to #d7eee9 by SpectrumVisualizer, independent of album colours.
- Spectrum canvases extend above their layout slots: the full player allows 180–280px, the listening panel 200px, and immersive mode 52vh. Dots travel upward with an edge fade; the main baseline sits at 84% of canvas height. Particles are capped at 64, with no tails.
- LibraryCover always uses VinylCover. Track lists, song grids, albums, playlists, sidebar pins, search results, queue, transport, song Info, and editing previews share the sleeve and exposed-disc design. Playlist mosaics remain inside the sleeve. Artist portraits retain their separate portrait presentation.
- The former artwork/vinyl selector is replaced with a description of the consistent record presentation. No music files or artwork tags were rewritten.
- The disc's slide-out geometry stays within its proportional stage. Listening content scrolls vertically without an incidental horizontal scrollbar.
- Reduced motion, visualizer visibility, hidden/offscreen suspension, frame and particle limits remain in place.

## Verification

- Production frontend build and TypeScript checks passed after the final column redesign. Vite retains its existing advisory about a bundle exceeding 500kB; this does not fail the build.
- All 27 existing frontend tests passed.
- Eleven checks in the running native Tauri app passed: music covers across library/home/queue/Info/transport, extended particle canvas, no orange spectrum pixels, changing audio-driven canvas frames, and particle rise. Final measured rise was 233 CSS pixels above the baseline on a 280px canvas.
- All 44 layout cases passed at 1100×680, 1280×720, 1440×900 and 1920×1080 after the final cover geometry and overflow corrections.
- The full player was inspected visually in the actual Windows app during muted playback. Screenshots in the concepts folder show the implementation, not generated concepts. The test restored the original playback position, mute state and playing/paused status and removed only its own temporary queue entries.

The native application remains open against the live development server. This change verifies the frontend build and running development app; no new Windows installer was packaged.
