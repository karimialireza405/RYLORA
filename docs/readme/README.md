# README artwork

Assets for the repository landing page. Keep these files local to the repository so the README does not depend on a third-party image host or badge service.

| Asset | Source |
| --- | --- |
| `hero.svg` | Editable vector artwork created for the README; graphite/silver palette and the application's sleeve-and-record identity. No external resources or scripts. |
| `player-en.jpg` | Current Now Playing interface, English. |
| `home-en.jpg` | Current Home interface, English. |
| `library-en.jpg` | Current Albums interface, English. |
| `home-fa.jpg` | Current Home interface, Persian / RTL. |

Screenshots were captured on **2026-10-16**, at **1280 × 720**, from the development browser preview of application source commit `462a26d`. The catalogue and cover artwork are fictional and come from `src/services/backend/preview.ts`. No personal music-library content is included.

These are screenshots of implemented screens. They do **not** demonstrate native decoding, audio output, real-time FFT or beat response: the browser preview emits no audio or spectrum data. Keep this distinction in captions when reusing them.

To refresh the gallery, run `npm run dev`, open `http://localhost:1420`, choose the appropriate language, and capture the named screen at the same viewport size. Update the date and source revision here when replacing images. Avoid stretching or compositing screenshots to imply a different application state.
