# Focused Home and unclipped typography — 2026-10-15

The user reported that Home was cluttered and that the lower parts of text were cropped, with screenshots of the full Home page and a mixed Persian/Latin player title.

## Home

The previous page repeated the current album in shortcuts, recently added records, history and the listening sidebar. Home now has two primary sections: a single continuation card with resume/pause and album access, followed by up to four other recently added records. The current album is excluded from that shelf. Repeated tabs, the history table and playlist shelf are removed from Home; their dedicated navigation remains. The large listening sidebar is suppressed only on Home, preserving its saved preference for library views. Header library counts are shown once, with a direct Browse library action. A 1280px content cap and deliberate section spacing keep the page composed on wide windows; the compact grid switches to two columns.

Continuation uses the playable current track, real history, then a playable recently added track. Right-click song actions, actual album playback order, empty-library import and unavailable-file reconnect paths remain functional. Metadata is displayed as stored; music files and tags are unchanged.

## Cropping cause and fix

The reported 42px mixed title had a 48px line box with overflow hidden from line clamping, while its combined font range measured 51px. The display, hero and heading line boxes now use line height 1.4. Single-line ellipsis text uses 1.55 to leave space for Persian fallback metrics and Latin descenders. Truncation still applies to long labels; its vertical box is no longer undersized.

The actual mixed title now measures 58.8px high, with 3px above and 4.8px below the font range. Persian-only and additional mixed stress titles also fit, as do the Home card labels. This preserves the existing font choice and data, rather than hiding letters or shortening titles.

## Validation

- Production build and TypeScript checks passed; all 30 existing frontend tests passed.
- Twelve running-app checks passed: two-section Home hierarchy, suppressed duplicate sidebar/tabs/history, limited record shelf, listening action, library/album navigation, sidebar availability in the library, three title metrics cases and unclipped Home labels. Playback actions were stubbed for this check; native playback, queue and metadata were untouched.
- All 44 existing layout cases passed at 1100×680, 1280×720, 1440×900 and 1920×1080 across Home, library, player, settings and dialogs.
- Actual native captures: [Home](../design-system/concepts/home-focused-final.png), [player title](../design-system/concepts/type-metrics-player-final.png).
