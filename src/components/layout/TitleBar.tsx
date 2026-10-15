import { ChevronLeft, ChevronRight, PanelRight, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { IconButton } from "@/components/ui/Button";
import { backend } from "@/services/backend";
import {
  goBack,
  goForward,
  navigate,
  useNavigation,
  useRoute,
} from "@/stores/navigation";
import { setPreference, useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/utils/cn";

/**
 * Custom title bar. The whole bar is a drag region (double-click maximises, as on
 * native windows); interactive controls opt out with `no-drag`.
 */
export function TitleBar({ scrolled }: { scrolled: boolean }) {
  const canBack = useNavigation((s) => s.index > 0);
  const canForward = useNavigation((s) => s.index < s.stack.length - 1);
  const panelOpen = useUi((s) => s.nowPlayingPanelOpen);
  const hasTrack = usePlayer((s) => s.current !== null);
  const wide = useMediaQuery("(min-width: 1320px)");
  const route = useRoute();

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "drag-region absolute inset-x-0 top-0 z-30 flex h-[var(--titlebar-height)] items-center gap-2 pl-4",
        "transition-[background-color,box-shadow] duration-(--duration-standard)",
        "border-b border-line bg-obsidian",
        scrolled && "shadow-[0_1px_0_0_var(--color-line)]",
      )}
    >
      <div className="no-drag flex items-center gap-1">
        <IconButton
          icon={ChevronLeft}
          label="Back"
          shortcut="Alt+←"
          size="sm"
          disabled={!canBack}
          onClick={goBack}
          tooltipSide="bottom"
        />
        <IconButton
          icon={ChevronRight}
          label="Forward"
          shortcut="Alt+→"
          size="sm"
          disabled={!canForward}
          onClick={goForward}
          tooltipSide="bottom"
        />
      </div>
      <SearchField />
      <div data-tauri-drag-region className="h-full flex-1" />
      {wide &&
        hasTrack &&
        route.name !== "home" &&
        route.name !== "nowPlaying" &&
        route.name !== "settings" && (
          <IconButton
            icon={PanelRight}
            label={
              panelOpen ? "Hide Now Playing panel" : "Show Now Playing panel"
            }
            active={panelOpen}
            aria-pressed={panelOpen}
            size="sm"
            className="no-drag mr-2"
            tooltipSide="bottom"
            onClick={() => {
              useUi.setState({
                nowPlayingPanelOpen: !panelOpen,
                queueOpen: false,
                listeningTab: "playing",
              });
              void setPreference("panelVisible", panelOpen ? "false" : "true");
            }}
          />
        )}
      <WindowControls />
    </header>
  );
}

function SearchField() {
  const query = useUi((s) => s.searchQuery);
  const route = useRoute();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("rylora:focus-search", focus);
    return () => window.removeEventListener("rylora:focus-search", focus);
  }, []);

  return (
    <label className="no-drag relative ml-auto flex h-9 w-[min(440px,42vw)] items-center">
      <Search
        className="pointer-events-none absolute left-3 size-4 text-ink-4"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Search your library"
        aria-label="Search your library"
        dir="auto"
        onFocus={() => route.name !== "search" && navigate({ name: "search" })}
        onChange={(e) => {
          useUi.setState({ searchQuery: e.target.value });
          if (route.name !== "search") navigate({ name: "search" });
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            useUi.setState({ searchQuery: "" });
            e.currentTarget.blur();
          }
        }}
        className={cn(
          "h-full w-full rounded-lg bg-deep pr-12 pl-9 text-body text-ink ring-1 ring-line-strong ring-inset placeholder:text-ink-4",
          "transition-[background-color,box-shadow] hover:bg-raised focus-visible:bg-raised focus-visible:ring-blue-soft/70 focus-visible:outline-none",
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      <kbd className="pointer-events-none absolute right-3 rounded-xs px-1 font-sans text-caption text-ink-4 ring-1 ring-line-strong">
        Ctrl K
      </kbd>
    </label>
  );
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = backend().system.window;
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized);
    void win
      .onResized(() => void win.isMaximized().then(setMaximized))
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const base =
    "no-drag inline-flex h-[var(--titlebar-height)] w-[46px] items-center justify-center text-ink-3 transition-colors duration-(--duration-micro)";
  return (
    <div className="flex self-start" role="group" aria-label="Window controls">
      <button
        type="button"
        aria-label="Minimize"
        className={cn(base, "hover:bg-white/8 hover:text-ink")}
        onClick={() => void backend().system.window.minimize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore" : "Maximize"}
        className={cn(base, "hover:bg-white/8 hover:text-ink")}
        onClick={() => void backend().system.window.toggleMaximize()}
      >
        {maximized ? (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden
          >
            <path d="M2.5 2.5V.5h7v7h-2" stroke="currentColor" />
            <rect x=".5" y="2.5" width="7" height="7" stroke="currentColor" />
          </svg>
        ) : (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden
          >
            <rect x=".5" y=".5" width="9" height="9" stroke="currentColor" />
          </svg>
        )}
      </button>
      <button
        type="button"
        aria-label="Close"
        className={cn(base, "hover:bg-[#c42b1c] hover:text-white")}
        onClick={() => void backend().system.window.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M.5.5l9 9m0-9l-9 9"
            stroke="currentColor"
            strokeWidth="1.05"
          />
        </svg>
      </button>
    </div>
  );
}
