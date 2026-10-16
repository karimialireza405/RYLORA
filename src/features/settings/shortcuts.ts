import type { Messages } from "@/i18n";

/** Single source for shortcut documentation (settings page + "?" dialog). Keys are not translated. */
export function shortcuts(t: Messages): Array<{ group: string; items: Array<[keys: string, action: string]> }> {
  const s = t.shortcuts;
  return [
    {
      group: s.playback,
      items: [
        ["Space", s.playPause],
        ["Ctrl + →", s.next],
        ["Ctrl + ←", s.previous],
        ["Shift + → / ←", s.seek],
        ["Ctrl + ↑ / ↓", s.volume],
        ["M", s.mute],
        ["S", s.shuffle],
        ["R", s.repeat],
        ["Ctrl + L", s.favorite],
      ],
    },
    {
      group: s.navigation,
      items: [
        ["Ctrl + O", s.addMusic],
        [`Ctrl + K  ${s.or}  /`, s.search],
        ["Alt + ← / →", s.backForward],
        ["Ctrl + 1 … 5", s.sections],
        ["Q", s.queue],
        ["F11", s.immersive],
        ["Ctrl + ,", s.settings],
        ["?", s.showShortcuts],
      ],
    },
    {
      group: s.lists,
      items: [
        ["↑ / ↓", s.move],
        [`Shift + ↑ / ↓, Ctrl + ${s.click}`, s.extend],
        ["Ctrl + A", s.selectAll],
        ["Enter", s.play],
        ["Shift + F10", s.options],
        ["Alt + ↑ / ↓", s.reorder],
        ["Delete", s.remove],
      ],
    },
    {
      group: s.immersiveGroup,
      items: [
        ["F", s.fullscreen],
        ["L", s.karaoke],
        ["Esc", s.exit],
      ],
    },
  ];
}
