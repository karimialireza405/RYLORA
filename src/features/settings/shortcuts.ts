/** Single source for shortcut documentation (settings page + "?" dialog). */
export const SHORTCUTS: Array<{ group: string; items: Array<[keys: string, action: string]> }> = [
  {
    group: "Playback",
    items: [
      ["Space", "Play / pause"],
      ["Ctrl + →", "Next track"],
      ["Ctrl + ←", "Previous track / restart"],
      ["Shift + → / ←", "Seek 5 seconds"],
      ["Ctrl + ↑ / ↓", "Volume up / down"],
      ["M", "Mute / unmute"],
      ["S", "Shuffle on / off"],
      ["R", "Cycle repeat (off → all → one)"],
      ["Ctrl + L", "Favorite the current song"],
    ],
  },
  {
    group: "Navigation",
    items: [
      ["Ctrl + O", "Add your music"],
      ["Ctrl + K  or  /", "Search"],
      ["Alt + ← / →", "Back / forward"],
      ["Ctrl + 1 … 5", "Home, Songs, Albums, Artists, Playlists"],
      ["Q", "Show / hide queue"],
      ["F11", "Immersive mode"],
      ["Ctrl + ,", "Settings"],
      ["?", "Show keyboard shortcuts"],
    ],
  },
  {
    group: "Lists",
    items: [
      ["↑ / ↓", "Move through songs"],
      ["Shift + ↑ / ↓, Ctrl + click", "Extend selection"],
      ["Ctrl + A", "Select all"],
      ["Enter", "Play"],
      ["Shift + F10", "Song options"],
      ["Alt + ↑ / ↓", "Reorder (playlists and queue)"],
      ["Delete", "Remove from playlist"],
    ],
  },
  {
    group: "Immersive mode",
    items: [
      ["F", "Toggle fullscreen"],
      ["Esc", "Exit"],
    ],
  },
];
