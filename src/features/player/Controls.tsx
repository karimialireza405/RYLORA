import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { IconButton } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { WaveformSeek } from "./WaveformSeek";
import { player, usePlayer, useProgress } from "@/stores/player";
import { cn } from "@/utils/cn";
import { formatTime } from "@/utils/format";

/** Round play/pause button with an icon cross-fade. */
export function PlayButton({
  size = "md",
  className,
}: {
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  const status = usePlayer((s) => s.status);
  const hasTrack = usePlayer((s) => s.current !== null);
  const playing = status === "playing" || status === "loading";
  const dims = { md: "size-9", lg: "size-14", xl: "size-[72px]" }[size];
  const glyph = { md: "size-[18px]", lg: "size-6", xl: "size-8" }[size];
  return (
    <button
      type="button"
      onClick={player.toggle}
      disabled={!hasTrack}
      aria-label={playing ? "Pause" : "Play"}
      title={playing ? "Pause (Space)" : "Play (Space)"}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-blue-soft text-obsidian",
        "shadow-transport transition-[transform,background-color] duration-(--duration-micro) ease-(--ease-out)",
        "hover:scale-[1.04] hover:bg-accent-hover active:scale-95 disabled:opacity-40 disabled:hover:scale-100",
        dims,
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={playing ? "pause" : "play"}
          initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 20 }}
          transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          className="flex"
        >
          {playing ? (
            <Pause
              className={cn(glyph, "fill-current")}
              strokeWidth={0}
              aria-hidden
            />
          ) : (
            <Play
              className={cn(glyph, "translate-x-[1.5px] fill-current")}
              strokeWidth={0}
              aria-hidden
            />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function TransportControls({
  size = "md",
}: {
  size?: "md" | "lg" | "xl";
}) {
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const hasTrack = usePlayer((s) => s.current !== null);
  const big = size !== "md";
  return (
    <div className={cn("flex items-center", big ? "gap-5" : "gap-2")}>
      <IconButton
        icon={Shuffle}
        label={shuffle ? "Shuffle on" : "Shuffle off"}
        shortcut="S"
        size={big ? "md" : "sm"}
        active={shuffle}
        aria-pressed={shuffle}
        onClick={player.toggleShuffle}
        disabled={!hasTrack}
      />
      <IconButton
        icon={SkipBack}
        label="Previous"
        shortcut="Ctrl+←"
        size={big ? "lg" : "md"}
        iconClassName="fill-current"
        onClick={player.previous}
        disabled={!hasTrack}
      />
      <PlayButton size={size} />
      <IconButton
        icon={SkipForward}
        label="Next"
        shortcut="Ctrl+→"
        size={big ? "lg" : "md"}
        iconClassName="fill-current"
        onClick={player.next}
        disabled={!hasTrack}
      />
      <IconButton
        icon={repeat === "one" ? Repeat1 : Repeat}
        label={
          repeat === "off"
            ? "Repeat off"
            : repeat === "all"
              ? "Repeat all"
              : "Repeat one"
        }
        shortcut="R"
        size={big ? "md" : "sm"}
        active={repeat !== "off"}
        aria-pressed={repeat !== "off"}
        onClick={player.cycleRepeat}
        disabled={!hasTrack}
      />
    </div>
  );
}

export function ProgressBar({
  size = "md",
  className,
}: {
  size?: "md" | "lg";
  className?: string;
}) {
  const positionMs = useProgress((s) => s.positionMs);
  const durationMs = useProgress((s) => s.durationMs);
  const hasTrack = usePlayer((s) => s.current !== null);
  const time = cn(
    "tabular shrink-0 text-ink-3",
    size === "lg" ? "text-meta w-12" : "text-caption w-10",
  );
  const trackId = usePlayer((s) => s.current?.id ?? null);
  return (
    <div className={cn("flex w-full items-center gap-3", className)}>
      <span className={cn(time, "text-right")}>{formatTime(positionMs)}</span>
      <WaveformSeek
        value={positionMs}
        max={durationMs}
        large={size === "lg"}
        trackId={trackId}
        disabled={!hasTrack || durationMs <= 0}
        onCommit={(v) => player.seek(v)}
      />
      <span className={time}>{formatTime(durationMs)}</span>
    </div>
  );
}

export function VolumeControl({
  className,
  width = "w-28",
}: {
  className?: string;
  width?: string;
}) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const effective = muted ? 0 : volume;
  const Icon =
    effective === 0
      ? VolumeX
      : effective < 0.34
        ? Volume
        : effective < 0.67
          ? Volume1
          : Volume2;
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <IconButton
        icon={Icon}
        label={muted ? "Unmute" : "Mute"}
        shortcut="M"
        size="sm"
        onClick={player.toggleMute}
      />
      <div className={width}>
        <Slider
          label="Volume"
          value={Math.round(effective * 100)}
          max={100}
          step={1}
          valueText={`${Math.round(effective * 100)}%`}
          onChange={(v) => player.setVolume(v / 100)}
          renderBubble={(v) => `${Math.round(v)}%`}
        />
      </div>
    </div>
  );
}
