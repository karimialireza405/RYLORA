import * as RadixSlider from "@radix-ui/react-slider";
import { useState, type ReactNode } from "react";

import { cn } from "@/utils/cn";

interface SliderProps {
  value: number;
  max: number;
  step?: number;
  label: string;
  /** Screen-reader text for the current value, e.g. "1:23 of 4:05". */
  valueText?: string;
  disabled?: boolean;
  /** Called continuously while dragging. */
  onChange?: (value: number) => void;
  /** Called once when the user releases. */
  onCommit?: (value: number) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Floating label shown above the thumb while dragging. */
  renderBubble?: (value: number) => ReactNode;
}

const heights = { sm: "h-1", md: "h-1", lg: "h-1.5" } as const;

/**
 * Track + fill + thumb. The thumb appears on hover/focus/drag only, keeping the bar
 * calm at rest; the fill brightens to the accent while interacting.
 */
export function Slider({ value, max, step = 1, label, valueText, disabled, onChange, onCommit, className, size = "md", renderBubble }: SliderProps) {
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(value);
  const shown = dragging ? dragValue : value;
  const safeMax = max > 0 ? max : 1;

  return (
    <RadixSlider.Root
      className={cn("group relative flex h-5 w-full touch-none items-center select-none", disabled && "opacity-40", className)}
      value={[Math.min(shown, safeMax)]}
      max={safeMax}
      step={step}
      disabled={disabled}
      aria-label={label}
      onValueChange={([v = 0]) => {
        setDragging(true);
        setDragValue(v);
        onChange?.(v);
      }}
      onValueCommit={([v = 0]) => {
        setDragging(false);
        onCommit?.(v);
      }}
      onPointerUp={() => setDragging(false)}
    >
      <RadixSlider.Track className={cn("relative grow overflow-hidden rounded-full bg-white/12", heights[size])}>
        <RadixSlider.Range
          className={cn(
            "absolute h-full rounded-full transition-colors duration-(--duration-micro)",
            dragging ? "bg-blue-soft" : "bg-blue group-hover:bg-blue-soft group-focus-within:bg-blue-soft",
          )}
        />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        aria-label={label}
        aria-valuetext={valueText}
        className={cn(
          "relative block size-3 rounded-full bg-ink shadow-[0_2px_6px_rgb(0_0_0/0.5)]",
          "scale-0 transition-transform duration-(--duration-micro) ease-(--ease-out)",
          "group-hover:scale-100 focus-visible:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-soft",
          dragging && "scale-110",
        )}
      >
        {dragging && renderBubble && (
          <span className="tabular pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-md bg-lifted px-2 py-1 text-caption font-medium whitespace-nowrap text-ink shadow-popover">
            {renderBubble(dragValue)}
          </span>
        )}
      </RadixSlider.Thumb>
    </RadixSlider.Root>
  );
}
