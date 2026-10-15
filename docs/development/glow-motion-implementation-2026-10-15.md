# RYLORA: light typography, organized library controls and reactive motion

Date: 2026-10-15. The user requested a downloaded thin luxury font, a redesign of the library control bars, glow on text/album covers, a better visual equalizer with particles and an animated nonlinear-looking timeline.

## Research and direction

- [Urbanist by Corey Hu](https://github.com/coreyhu/Urbanist): an OFL variable geometric sans-serif with light weights. The Fontsource package is installed, self-hosted and imported in the application; the previous Manrope/Syne runtime imports and packages were removed. The [license](../design-system/Urbanist-OFL.txt) is retained.
- [Modern Music Player UI Design on Dribbble](https://dribbble.com/shots/26674456-Modern-Music-Player-UI-Design): visually reviewed its control hierarchy and concentrated light around key controls.
- [Miniplayer by Voicu Apostol](https://dribbble.com/shots/2829809-Miniplayer): visually reviewed its delicate moving wave and spare typography.
- [Audio Spectrum/Player Animation by Anton Zuienko](https://dribbble.com/shots/8106317-Audio-Spectrum-Player-Animation): reviewed the author's primary project page and spectrum-animation direction.
- Behance and Awwwards were searched, but the selected project pages returned access/fetch failures. They are not claimed as inspected live designs.

The resulting implementation uses RYLORA's own controls and actual local artwork. No reference artwork or third-party interface image was copied into the application.

## Implemented changes

- Urbanist weight 300 for headings and 350 for general text; Vazirmatn light weights for Persian. Headings, wordmark and selected text receive a soft glow.
- Open underline library tabs and one aligned search/sort/layout toolbar, with a single song/album count and balanced header actions.
- Light halos around artwork, artwork-colored glow behind vinyl and a breathing halo while playing.
- FFT-driven visual equalizer uses smooth mirrored envelopes, fine filaments, luminous particles and short trails. This is a visualizer; no audio EQ processing was added.
- Timeline uses moving curved light ribbons, a progress beacon and small particles. Its x-position remains proportional to time for predictable seeking. It is not a whole-file audio waveform.
- Pointer and keyboard seek continue to control the native player. Seek and volume thumbs now have explicit accessible labels.
- Canvas drawing is bounded, pauses when settled/hidden/offscreen, and honors reduced motion. The existing audio bus is reference-counted and shared among views.

## Validation

- Production build and strict TypeScript pass; all 27 frontend tests pass.
- 44 layout cases pass at 1100x680, 1280x720, 1440x900 and 1920x1080.
- 16 checks in the native webview pass: downloaded font loading, toolbar organization, single count, light headings, visible text/artwork glow, mounted spectrum, changing ribbon/spectrum pixels during real playback, actual nonzero native FFT frames, accessible seeking, keyboard seeking, stationary paused rendering, and usable reduced-motion behavior.
- Real pointer input on the ribbon sought to 133000ms, within one second of the expected 133290ms at 65% of the current track. Playback position/status/mute were restored after checks.
- No Rust/audio decoder/database change was required for this iteration. The existing native FFT supplies the reactive data.

## Actual screenshots

- [Library controls and new typography](../design-system/concepts/glow-library-implemented.png)
- [Player, artwork glow, reactive spectrum and particles during playback](../design-system/concepts/glow-player-implemented.png)

These are native application captures, not generated mockups. Static screenshots show one animation frame; the live app shows motion after Play. The existing frontend chunk-size warning remains; no complete performance benchmark or accessibility certification is claimed.
