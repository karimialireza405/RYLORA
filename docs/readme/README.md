# README artwork

Assets for the repository landing page. Keep these files local to the repository so the README does not depend on a third-party image host or badge service.

| Asset | Source |
| --- | --- |
| `hero-en-v2.png` | English editorial banner, generated and typeset with the built-in image generation tool on October 20, 2026. Original photographic-style brand illustration, not an application screenshot. |
| `hero-fa-v2.png` | Persian edition of the same visual direction with RTL copy and a mirrored photographic composition. |
| `release.svg`, `platform.svg`, `engine.svg`, `language.svg` | Local vector badges for the verified release, target, stack, and languages. |
| `download-en.svg`, `download-fa.svg` | Local English/Persian download links styled as buttons; version and file size match the published release at redesign time. |
| `hero.svg` | Earlier editable vector banner retained as a source asset; the landing READMEs now use the v2 PNG banners. |
| `player-en.jpg` | Current Now Playing interface, English. |
| `home-en.jpg` | Current Home interface, English. |
| `library-en.jpg` | Current Albums interface, English. |
| `home-fa.jpg` | Current Home interface, Persian / RTL. |

Screenshots were captured on **2026-10-16**, at **1280 × 720**, from the development browser preview of application source commit `462a26d`. The catalogue and cover artwork are fictional and come from `src/services/backend/preview.ts`. No personal music-library content is included.

These are screenshots of implemented screens. They do **not** demonstrate native decoding, audio output, real-time FFT or beat response: the browser preview emits no audio or spectrum data. Keep this distinction in captions when reusing them.

To refresh the gallery, run `npm run dev`, open `http://localhost:1420`, choose the appropriate language, and capture the named screen at the same viewport size. Update the date and source revision here when replacing images. Avoid stretching or compositing screenshots to imply a different application state.

## October 20, 2026 redesign

The complete [image-generation and localization prompts](image-prompts.md) are included for provenance. Banners are the direct outputs of the built-in generation/editing tool; their typography and product arrangement are illustrative. They do not show a physical RYLORA product or demonstrate audio performance.

The READMEs keep gallery provenance explicit, present the public Windows installer prominently, and put deeper technical notes in collapsible sections. Repository visibility was checked live: **public**, default branch `master`; release `v0.1.0` contains the Windows x64 installer and checksum file. No project license, executable, or application behavior was changed by this documentation update.
