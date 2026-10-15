import { useEffect, useRef, type PointerEvent } from "react";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { player } from "@/stores/player";
import { addToPlaylist } from "@/features/playlists/actions";

/** Pointer transfers also work in Tauri windows with native file drops enabled. */
export function useTrackTransfer() {
  const pending = useRef<{
    x: number;
    y: number;
    ids: number[];
    active: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    let highlighted: HTMLElement | null = null;
    const clear = () => {
      highlighted?.removeAttribute("data-transfer-over");
      highlighted = null;
      pending.current = null;
      useUi.setState({ dragTrackIds: [] });
    };
    const targetAt = (x: number, y: number) =>
      document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-track-drop]") ?? null;
    const move = (e: globalThis.PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!e.buttons) {
        clear();
        return;
      }
      if (!p.active && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
        p.active = true;
        suppressClick.current = true;
        useUi.setState({ dragTrackIds: p.ids });
      }
      if (p.active) {
        e.preventDefault();
        const target = targetAt(e.clientX, e.clientY);
        if (target !== highlighted) {
          highlighted?.removeAttribute("data-transfer-over");
          highlighted = target;
          highlighted?.setAttribute("data-transfer-over", "true");
        }
      }
    };
    const up = (e: globalThis.PointerEvent) => {
      const p = pending.current;
      if (p?.active) {
        const target = targetAt(e.clientX, e.clientY);
        if (target?.dataset.trackDrop === "queue") player.enqueue(p.ids);
        else if (target?.dataset.trackDrop === "playlist") {
          const playlist = useLibrary
            .getState()
            .playlists.find(
              (item) => item.id === Number(target.dataset.playlistId),
            );
          if (playlist) void addToPlaylist(playlist, p.ids);
        }
      }
      clear();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", clear);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", clear);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, []);
  return {
    start: (e: PointerEvent, ids: number[]) => {
      if (
        ids.length &&
        e.button === 0 &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey
      ) {
        suppressClick.current = false;
        pending.current = { x: e.clientX, y: e.clientY, ids, active: false };
      }
    },
    consumeClick: () => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return true;
      }
      return false;
    },
  };
}
