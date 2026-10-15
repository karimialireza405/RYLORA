# Perspective audio field — 2026-10-15

The user rejected the conventional vertical spectrum. The replacement is a floating point-cloud terrain with depth, cover-coloured atmosphere, fine ridge highlights, a floor reflection, beat-driven expanding rings and high-rising individual motes.

## Research and direction

- [Field — AUDIO Reimagined, Ananyaa](https://dribbble.com/shots/26123832--Field-AUDIO-Reimagined): inspected visually in the browser. Its spatial particle field informed the choice of depth and a wide perspective surface. It is a Blender/Keynote concept, not an existing music-player implementation.
- [3D Abstract Light Spectrum, tony nilsen](https://dribbble.com/shots/26558989-3D-Abstract-Light-Spectrum): inspected visually for volumetric colour and luminous form. RYLORA uses lighter tints of its actual cover accent rather than a fixed rainbow.
- [AIKIZI music visualizer](https://aikizi.com/lab/music-visualizer): reviewed its published description of assigning spectrum ranges to particles. No user audio was uploaded and no external code/assets were copied.

## Implementation

ParticleFieldScene draws 3,520 terrain dots in the full stage, or 768 in the compact sidebar. The native 64-band FFT supplies frequency height, with temporal smoothing and spatial folds. The surface has far-to-near perspective spacing and depth-dependent point size. A light front ridge, very quiet floor reflection and wide elliptical haze establish depth. Real musical attacks use the existing AudioPulseEnvelope to excite expanding perspective ripples, capped at three. Floating motes are individual circles with cached halo sprites and no tails, capped at 84 full-size or 28 compact.

The current artwork accent drives the full field; highlights use a lighter tint of the same hue. Seek behaviour, cover pulse and user artwork are preserved. Paused energy decays, existing motes/ripples settle, then the frame loop sleeps. Reduced motion removes the spectrum; visualizer-off, hidden and offscreen behaviour remain supported. Drawing is scheduled up to 60fps for the spectrum and 30fps for the timeline; FFT acquisition remains shared.

## Validation

- Production build and TypeScript checks passed; all 30 frontend tests passed.
- Four running-app pixel checks passed for two real artwork accents, a cover edit while paused, and missing-accent fallback. All spectrum/timeline instances shared the expected colours.
- Native visual inspection confirmed that the former bars were replaced by a layered point-cloud field, with cover-coloured highlights and high-rising particles.
- A real-playback canvas sample changed across frames and contained 30,222 lit pixels, with floating light reaching y=6 on a 252px canvas.
- Profiling caught an expensive glow-filter path. Replacing live shadow blurs with a cached 32×32 glow sprite restored the foreground display callback rate from roughly 8fps to 75fps on this system in the 30fps-render pass. This measures overall display callbacks, not FFT or canvas paint frequency. The final spectrum scheduling allows up to 60 paints/second.

The actual application is open against the live development server. No new installer is packaged by this visual change.
