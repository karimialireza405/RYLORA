import * as RadixSlider from "@radix-ui/react-slider";
import { useEffect, useState } from "react";
import { AudioScene } from "@/features/visualizer/AudioScene";
import { usePlayer } from "@/stores/player";
import { formatTime } from "@/utils/format";
import { cn } from "@/utils/cn";
import { messages } from "@/i18n";

/** Full ribbon seek target, retaining Radix keyboard, touch and accessibility behavior. */
export function WaveformSeek({
  value,
  max,
  disabled,
  onCommit,
  large = false,
  trackId,
}: {
  value: number;
  max: number;
  disabled: boolean;
  onCommit: (value: number) => void;
  large?: boolean;
  trackId: number | null;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const accent = usePlayer((s) => s.current?.accent);
  useEffect(() => setDraft(null), [trackId]);
  const shown = draft ?? value,
    safeMax = Math.max(1, max);
  return (
    <RadixSlider.Root
      dir="ltr"
      aria-label={messages().player.seek}
      value={[Math.max(0, Math.min(shown, safeMax))]}
      max={safeMax}
      step={1000}
      disabled={disabled}
      className={cn(
        "waveform-seek group relative flex min-w-0 flex-1 touch-none items-center",
        large ? "h-12" : "h-7",
        disabled && "opacity-40",
      )}
      onValueChange={([next = 0]) => setDraft(next)}
      onValueCommit={([next = 0]) => {
        setDraft(null);
        onCommit(next);
      }}
      onPointerCancel={() => setDraft(null)}
    >
      <div className="absolute inset-0 overflow-hidden rounded-sm">
        <AudioScene mode="timeline" progress={shown / safeMax} accent={accent} />
      </div>
      <RadixSlider.Track className="relative h-full grow">
        <RadixSlider.Range className="absolute h-full" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        aria-label={messages().player.seek}
        aria-valuetext={messages().player.positionOf(formatTime(shown), formatTime(max))}
        className="relative block h-7 w-3 rounded-full outline-none focus-visible:ring-1 focus-visible:ring-blue-soft/60 focus-visible:shadow-accent-focus"
      >
        {draft !== null && (
          <span className="tabular pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-md bg-lifted px-2 py-1 text-caption text-ink shadow-popover">
            {formatTime(draft)}
          </span>
        )}
      </RadixSlider.Thumb>
    </RadixSlider.Root>
  );
}
