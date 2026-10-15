import { Maximize, Minimize, X } from "lucide-react";
import { motion, useIsPresent } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { VinylCover } from "@/components/ui/VinylCover";
import { IconButton } from "@/components/ui/Button";
import { SpectrumVisualizer } from "@/features/visualizer/SpectrumVisualizer";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { backend } from "@/services/backend";
import { useLibrary } from "@/stores/library";
import { usePlayer } from "@/stores/player";
import { prefEnabled, useUi } from "@/stores/ui";
import { cn } from "@/utils/cn";
import { isRtl } from "@/utils/format";
import { ProgressBar, TransportControls, VolumeControl } from "./Controls";
import { AmbientWash } from "./NowPlayingPage";

const IDLE_MS = 3000;

/** Distraction-free, full-window listening. Esc exits; F toggles fullscreen. */
export function ImmersivePlayer() {
  const current = usePlayer((s) => s.current);
  const track = useLibrary((s) =>
    current ? (s.trackById.get(current.id) ?? current) : null,
  );
  const ambient = useUi((s) => prefEnabled(s.prefs, "ambientBackground"));
  const reduced = useReducedMotion();
  const playing = usePlayer((s) => s.status === "playing");
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const timer = useRef<number>(0);
  const rootRef = useRef<HTMLDivElement>(null);
  // While fading out, never intercept input meant for the app underneath.
  const present = useIsPresent();

  const exit = useCallback(async () => {
    if (await backend().system.window.isFullscreen())
      await backend().system.window.setFullscreen(false);
    useUi.setState({ immersive: false });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const next = !(await backend().system.window.isFullscreen());
    await backend().system.window.setFullscreen(next);
    setFullscreen(next);
  }, []);

  const poke = useCallback(() => {
    setIdle(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  // Return focus to whatever opened immersive mode once it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
    };
  }, []);

  useEffect(() => {
    poke();
    rootRef.current?.focus();
    void backend().system.window.isFullscreen().then(setFullscreen);
    const onKey = (e: KeyboardEvent) => {
      poke();
      if (e.key === "Escape") {
        e.preventDefault();
        void exit();
      } else if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        void toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer.current);
    };
  }, [exit, poke, toggleFullscreen]);

  // Nothing left to show (e.g. queue cleared): leave immersive mode.
  useEffect(() => {
    if (!track) useUi.setState({ immersive: false });
  }, [track]);
  if (!track) return null;

  const accent = track.accent ?? "#e8ebf0";
  const chrome = cn(
    "transition-opacity duration-500",
    idle ? "pointer-events-none opacity-0" : "opacity-100",
  );

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Immersive player: ${track.title} by ${track.artist}`}
      tabIndex={-1}
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.01, transition: { duration: 0.2 } }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      onPointerMove={poke}
      onPointerDown={poke}
      className={cn(
        "fixed inset-0 z-[70] overflow-hidden bg-obsidian outline-none",
        idle && "cursor-none",
        !present && "pointer-events-none",
      )}
    >
      {ambient && (
        <AmbientWash accent={accent} trackKey={track.id} drift={!reduced} />
      )}

      <div
        data-tauri-drag-region
        className={cn(
          "drag-region absolute inset-x-0 top-0 z-10 flex h-16 items-center justify-end gap-1 px-4",
          chrome,
        )}
      >
        <div className="no-drag flex gap-1">
          <IconButton
            icon={fullscreen ? Minimize : Maximize}
            label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            shortcut="F"
            onClick={() => void toggleFullscreen()}
            tooltipSide="bottom"
          />
          <IconButton
            icon={X}
            label="Exit immersive mode"
            shortcut="Esc"
            onClick={() => void exit()}
            tooltipSide="bottom"
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[52vh] opacity-80">
        <SpectrumVisualizer
          variant="mirror"
          coarse
          className="mx-auto max-w-[1400px] px-10"
        />
      </div>

      <div className="relative flex h-full flex-col items-center justify-center px-10 pt-16 pb-[6vh]">
        <motion.div
          key={track.id}
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="flex flex-col items-center"
        >
          <VinylCover
            fullBleed
            hash={track.artwork}
            seed={track.album}
            artist={track.artist}
            title={track.album}
            accent={track.accent}
            out
            spinning={playing && !reduced}
            alt={`${track.album} by ${track.artist}`}
            className="translate-x-[6%]"
            style={{
              height: "min(38vh, 34vw)",
              width: "calc(min(38vh, 34vw) * 1.3)",
            }}
          />
          <h1
            dir={isRtl(track.title) ? "rtl" : undefined}
            className="glow-room mt-[4vh] line-clamp-2 max-w-[80vw] text-center text-balance font-display text-[clamp(28px,4.4vh,56px)] leading-tight font-light glow tracking-[-0.01em]"
          >
            {track.title}
          </h1>
          <p className="mt-2 max-w-[70vw] truncate text-center text-[clamp(15px,2vh,20px)] text-ink-2">
            {track.artist} <span className="text-ink-4">·</span> {track.album}
          </p>
        </motion.div>

        <div className={cn("mt-[4vh] w-[min(640px,80vw)]", chrome)}>
          <ProgressBar size="lg" />
          <div className="mt-[2.5vh] flex items-center justify-center">
            <TransportControls size="xl" />
          </div>
          <div className="mt-[2.5vh] flex justify-center">
            <VolumeControl width="w-36" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
