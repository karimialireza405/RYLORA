# Silver Graphite theme — 2026-10-15

The user rejected the app's green theme. The replacement is a neutral graphite and silver control palette, allowing artwork colours to remain the expressive part of the player.

Central accent tokens are #c1c7d2 (state), #e8ebf0 (primary) and #f8f9fc (hover). Existing blue/violet utility names alias these tokens for compatibility. Primary buttons, transport, active navigation, tabs, sliders, focus, selected content, drag targets and text glow follow the neutral palette. Green hardcoded button hover colours, text shadows, transport shadows and artwork/collection fallback glows were replaced. Transport, tab and focus shadows now use shared tokens. Semantic success messages retain their distinct success colour.

Cover-derived spectrum, particle and timeline colours remain dynamic and were verified in the running app. The production frontend build passed. Runtime computed styles confirmed the accent aliases resolve, and the play button is rgb(232, 235, 240) with a neutral shadow. Primary accent contrast ranges from 15.79:1 on the main surface to 11.01:1 on the lifted input surface; dark transport glyph contrast is 15.79:1. A source search found no remaining old sage hex/RGB values in src. This is colour verification, not a complete accessibility audit.

Actual native screenshot: [Silver Graphite player](../design-system/concepts/silver-graphite-player-final.png).
