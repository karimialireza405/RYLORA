# RYLORA Studio: concept implemented

Date: 2026-10-15. The user approved implementation of the proposed UI/UX evolution.

## Result

The concept is implemented with live components and the native local library. Home has two continue-listening records, a four-cover recently-added grid and real recent listening. The neutral graphite/sage palette and bundled Manrope, Syne and Persian Vazirmatn fonts remain consistent. Actual content and cover art are preserved, so the screenshot differs from the fictional catalogue in the generated concept.

[Actual Windows application capture](../design-system/concepts/studio-next-implemented.png)

## Implemented interactions

- Listening sidebar has Now playing, Queue and Info tabs, keyboard navigation, a single browsing transport, and persistent visibility/width. It resizes from 280 to 400 pixels by pointer or keyboard. The existing functional queue supports removal and reordering.
- Albums can be pinned/unpinned through their context menu; pins appear in the sidebar and persist in native preferences.
- Songs and albums have separate persistent grid/list layouts. Song sorting persists and supports most played from real counts. Album sorting supports title, artist and recently added. Search/filter and existing multi-selection remain available.
- Selected tracks can be dragged from the table to Queue or a sidebar playlist using pointer transfers compatible with native Tauri file drops.
- Settings offers full artwork or vinyl for browsing. Large listening stages use a narrow paper sleeve with vinyl; smaller thumbnails expose the original artwork.
- Song information editor supports title, artist, album, album artist, year, genre and replacement cover selection. It saves to the library by default. A separate opt-in checkbox writes tags and selected cover to the audio file. Unsupported/unwritable files report errors.
- Migration 002 stores user metadata edits separately and reapplies them after reindexing; track identity and favorite associations are preserved. File tag writes use a private sibling copy, verify parsing and replace the original only after successful preparation.
- Import reports newly added and existing songs, unreadable file details, folder progress, stopping and completed scan summaries. Dropped files do not interrupt the current session.

## Verification

- Production frontend build and strict TypeScript checks pass.
- All 27 frontend tests pass, including partial/total import failures, duplicate reporting, non-interrupting drops and real play-count sorting.
- All 37 native Rust tests pass, including schema validity, metadata edits surviving reindexing with Persian titles/favorite identity, failed file edits leaving originals intact and WAV tag edits preserving duration.
- 44 route/dialog layout cases pass across 1100x680, 1280x720, 1440x900 and 1920x1080. Checks cover home, songs, albums, full player, lyrics, settings, import, Info, Queue, edit dialog and grid. Main horizontal overflow, dialog bounds and player control bounds were checked.
- 18 checks pass in the real Tauri webview, covering the home composition, contextual tabs, native preference persistence, editing defaults, pin visibility, list/grid switches, most-played sorting, multi-selection, pointer transfers to Queue/playlist and loaded artwork.
- Native library remains at 21 tracks and 8 albums after verification. Temporary verification playlists and queue entries were removed, and presentation preferences restored.
- The desktop window is running against a detached hidden development server for live inspection. The image above is a native screenshot, not a generated mockup.

## Scope and limitations

The interface continues to use English navigation with proper Persian metadata/font support; a complete translated interface was not part of this redesign. Generated album/playlist examples were not inserted into the user's library. The frontend build retains its existing bundle-size warning (approximately 694 kB before gzip); no performance benchmark or complete accessibility compliance certification is claimed. Native file-tag regression coverage added here directly verifies WAV and invalid-file behavior; other formats rely on the existing Lofty writer and report unsupported-write errors.
