# RYLORA: research, concepts and selected direction

Date: 2026-10-14. User brief: make the UI credible as a professionally shipped music application; study established interfaces, generate several directions, choose the strongest and implement it.

## Source review

| Reference | What was reviewed | Resulting design interpretation |
|---|---|---|
| [Spotify desktop redesign](https://newsroom.spotify.com/2023-06-20/spotify-desktop-experience-redesign-your-library-now-playing-views-customize/) | Official article and product screenshot; library on the left, Now Playing on the right, compact/filterable collection | Keep browsing and listening available together; offer an optional right sidebar. |
| [Spotify Design: desktop foundation](https://medium.com/spotify-design/designing-a-new-foundation-spotify-for-desktop-58305f16ce72) | Primary design-team article; quick access, reusable track rows and accessibility | Use real library shortcuts, shared controls and metadata that adjusts to the available space. |
| [Apple Music for Windows](https://support.apple.com/guide/music-windows/welcome/windows) | Official Home and album-library images and the sidebar/window guide | Keep readable type, stable navigation and a disciplined album grid. The light concept explored this pattern. |
| [Qobuz desktop/web player](https://www.qobuz.com/us-en/discover/apps-qobuz) | Official app page and product image of desktop/web collections | Give records useful density and keep the player in a persistent edge of the window. |
| [Roon](https://roon.app/en/) | Official product page, imagery and descriptions of collection/metadata navigation | Preserve the record's identity and context in the listening view. This informed the third concept. |

The source pages were current reads. The Spotify design articles themselves are dated 2021 and 2023 and are used for established interaction patterns, not claimed as screenshots of the latest release. TIDAL was also researched via its official support material, but its product website stopped at device verification; that barrier was not bypassed and a live TIDAL product UI was not inspected.

## Audit of the previous RYLORA UI

The highest-priority issues were oversized type and whitespace relative to the small library; repeated display typography/glow; the same albums appearing in several large home shelves; a large resume card competing with the permanent player; and navigation, controls and surfaces using several different visual treatments. The vinyl cover treatment and real local import/playback were valuable and retained.

## Three generated concepts

All three images were generated with the built-in image generation tool using separate ui-mockup prompts. These are concept images with invented album examples, not screenshots of the working app. Complete prompts are in [prompts.json](prompts.json).

| Concept | Image | Assessment |
|---|---|---|
| Studio | [studio-home.png](studio-home.png) | Strongest overall: browse, listen and queue are available in one composition; moderate density; compact utility type; one restrained state accent. Selected. |
| Archive | [archive-library.png](archive-library.png) | Clear, attractive light library. Strong for collecting albums, but weaker alignment with the existing dark listening experience and requires a full second palette. |
| Listening room | [listening-room.png](listening-room.png) | Strong focused player and queue; preserves the physical record identity. It gives browsing less attention, so it is a less suitable default home. |

This selection is a design judgment against the user brief and the critique framework (purpose, usability, hierarchy, consistency, accessibility), not a user-study result or an objective ranking.

## Implementation

Studio is implemented as live components rather than a raster image used as the interface. It includes the optional listening panel, close/restore control, queue substitution, six quick-access albums, horizontal record shelves, compact rotation rows, a neutral palette, consistent type and a smaller permanent player. Album pages, search, settings, import and immersive views share the same visual system.

Content remains the user's actual local collection. Consequently, album art, titles, counts and queue differ from the concept image. The library added by the user during this work is preserved; no sample replaces their music or artwork.

[Actual Windows app screenshot](studio-implemented.png) records the delivered Home view. It is a native window capture, not a generated image.

## Verification

- Production build and strict TypeScript pass.
- All 24 existing frontend tests pass.
- Four viewport sizes, 1100x680 through 1920x1080, cover 28 route/dialog layout cases without main-page horizontal overflow, out-of-bounds dialogs or out-of-bounds player controls.
- Token contrast calculation yields at least 4.54:1 for the lowest-emphasis text against every solid surface token.
- The real Windows app was visually inspected. Home filters, listening-panel close/restore, queue substitution, import dialog and playback state are checked against the running app.
- A detached, hidden development server keeps the real desktop window available for live changes.

The native audio engine and database schema were not rewritten for this visual change. The earlier project report lists audio and library features still outside the current implementation.

## Subsequent evolution: 2026-10-15

The approved [next concept](studio-next-2026-10-15.png) is now implemented. Its [native screenshot](studio-next-implemented.png) and [implementation/verification report](../../development/studio-next-implementation-2026-10-15.md) record the newer result. The sections above describe the earlier 2026-10-14 iteration. This newer work includes native metadata-edit persistence and additional validated presentation preferences.
