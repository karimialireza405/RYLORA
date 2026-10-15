import { useEffect } from "react";

import { setFavorite, useLibrary } from "@/stores/library";
import { goBack, goForward, navigate } from "@/stores/navigation";
import { player, usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

/** True when focus is on something Space/Enter should activate (buttons, sliders, list rows). */
function ownsSpace(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const role = el.getAttribute("role");
  return el.tagName === "BUTTON" || el.tagName === "A" || role === "slider" || role === "switch" || role === "tab" || role === "menuitem";
}

/** Global shortcuts. Documented in features/settings/shortcuts.ts. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if (ui.immersive && e.key !== " " && !e.ctrlKey) return; // immersive handles its own keys
      const typing = isTyping(e.target);
      const ctrl = e.ctrlKey || e.metaKey;
      const hasTrack = usePlayer.getState().current !== null;

      // Dialogs own keyboard input, including single-letter playback shortcuts.
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) return;
      if (ctrl && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        useUi.setState({ addMusicOpen: true });
        return;
      }

      // Shortcuts that work even while typing.
      if (ctrl && (e.key === "k" || e.key === "K" || e.key === "f" || e.key === "F")) {
        e.preventDefault();
        navigate({ name: "search" });
        window.dispatchEvent(new Event("rylora:focus-search"));
        return;
      }
      if (e.key === "F11") {
        e.preventDefault();
        if (hasTrack) useUi.setState({ immersive: !ui.immersive });
        return;
      }
      if (typing) return;

      if (e.altKey && e.key === "ArrowLeft") return void (e.preventDefault(), goBack());
      if (e.altKey && e.key === "ArrowRight") return void (e.preventDefault(), goForward());

      if (ctrl) {
        switch (e.key) {
          case "ArrowRight":
            e.preventDefault();
            return player.next();
          case "ArrowLeft":
            e.preventDefault();
            return player.previous();
          case "ArrowUp":
            e.preventDefault();
            return player.setVolume(usePlayer.getState().volume + 0.05);
          case "ArrowDown":
            e.preventDefault();
            return player.setVolume(usePlayer.getState().volume - 0.05);
          case "l":
          case "L": {
            e.preventDefault();
            const current = usePlayer.getState().current;
            if (!current) return;
            const fav = useLibrary.getState().trackById.get(current.id)?.favorite ?? current.favorite;
            return void setFavorite([current.id], !fav);
          }
          case ",":
            e.preventDefault();
            return navigate({ name: "settings" });
          case "1":
            e.preventDefault();
            return navigate({ name: "home" });
          case "2":
            e.preventDefault();
            return navigate({ name: "library", tab: "songs" });
          case "3":
            e.preventDefault();
            return navigate({ name: "library", tab: "albums" });
          case "4":
            e.preventDefault();
            return navigate({ name: "library", tab: "artists" });
          case "5":
            e.preventDefault();
            return navigate({ name: "playlists" });
        }
        return;
      }

      if (e.altKey) return;
      if (e.shiftKey && e.key === "ArrowRight") return void (e.preventDefault(), player.seekBy(5000));
      if (e.shiftKey && e.key === "ArrowLeft") return void (e.preventDefault(), player.seekBy(-5000));

      switch (e.key) {
        case " ":
          if (ownsSpace(e.target)) return;
          e.preventDefault();
          return player.toggle();
        case "m":
        case "M":
          return player.toggleMute();
        case "s":
        case "S":
          return hasTrack ? player.toggleShuffle() : undefined;
        case "r":
        case "R":
          return hasTrack ? player.cycleRepeat() : undefined;
        case "q":
        case "Q":
          return useUi.setState({ queueOpen: !ui.queueOpen });
        case "/":
          e.preventDefault();
          navigate({ name: "search" });
          return void window.dispatchEvent(new Event("rylora:focus-search"));
        case "?":
          return useUi.setState({ shortcutsOpen: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
