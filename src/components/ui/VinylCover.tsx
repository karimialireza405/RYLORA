import { memo, type CSSProperties, type ReactNode } from "react";
import { useAudioPulse } from "@/hooks/useAudioPulse";

import { type ArtworkSize } from "@/services/artwork";
import { cn, hueOf } from "@/utils/cn";
import { Artwork } from "./Artwork";

/**
 * RYLORA's signature cover treatment: a printed record sleeve (artwork inset on
 * textured paper, artist and title in wide-tracked caps) with the vinyl disc
 * sliding out of it. The disc's centre label is the artwork itself.
 *
 * Geometry is proportional (container-query units), so the same component works
 * from a 56 px playback-bar thumbnail up to the Now Playing stage.
 */
interface VinylCoverProps {
  hash: string | null | undefined;
  seed: string;
  /** Printed on the sleeve: artist at the top, title at the bottom. */
  artist?: string;
  title?: string;
  size?: ArtworkSize;
  /** Disc rotates (only while audio plays). */
  spinning?: boolean;
  /** Subtle scale pulse driven by real bass attacks; defaults to spinning. */
  pulse?: boolean;
  /** Disc slides further out of the sleeve (e.g. while playing). */
  out?: boolean;
  /** Hide sleeve lettering for very small renders. */
  bare?: boolean;
  /** Full artwork with a narrow paper edge, used in the listening stage. */
  fullBleed?: boolean;
  /** Custom inset (e.g. a playlist mosaic) instead of the artwork. */
  inset?: ReactNode;
  accent?: string | null;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}

// Paper grain: tiny static SVG noise tile, so it costs one decoded image for every sleeve.
const PAPER =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.33 0 0 0 0 0.3 0 0 0 0.09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/** Ink colour for sleeve lettering: the artwork accent, deepened to print on paper. */
function inkFor(accent: string | null | undefined, seed: string): string {
  const base = accent ?? `hsl(${hueOf(seed)} 55% 55%)`;
  return `color-mix(in srgb, ${base} 42%, #2a1720)`;
}

export const VinylCover = memo(function VinylCover({
  hash,
  seed,
  artist,
  title,
  size = "lg",
  spinning = false,
  pulse = spinning,
  out = false,
  bare = false,
  fullBleed = false,
  inset,
  accent,
  className,
  style,
  alt,
}: VinylCoverProps) {
  const audioPulse = useAudioPulse(pulse);
  return (
    <div
      ref={audioPulse.ref}
      className={cn(
        "group/vinyl relative isolate aspect-[1.3/1] [container-type:inline-size]",
        className,
      )}
      data-vinyl-cover
      data-playing={spinning || undefined}
      data-audio-pulse={audioPulse.enabled || undefined}
      style={{ "--art-tint": accent ?? "#c1c7d2", ...style } as CSSProperties}
      role={alt ? "img" : undefined}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
    >
      {/* Disc — sits behind the sleeve, peeking out to the right. */}
      <div
        className={cn(
          "absolute top-[2.5%] left-[22%] aspect-square h-[95%] transition-transform duration-500 ease-(--ease-emphasized)",
          out
            ? "translate-x-[6%]"
            : "group-hover:translate-x-[4%] group-hover/vinyl:translate-x-[4%]",
        )}
      >
        <div
          className={cn(
            // Rim light keeps the black disc legible against RYLORA's dark surfaces.
            "relative h-full w-full rounded-full shadow-[0_12px_30px_-10px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.07),inset_0_0_0_1px_rgb(255_255_255/0.08)]",
            spinning && "animate-[spin_4s_linear_infinite]",
          )}
          style={{
            background:
              "repeating-radial-gradient(circle at 50% 50%, #161618 0 1px, #232325 1px 2px, #151517 2px 4px)",
          }}
        >
          {/* Centre label: the artwork, so the record matches its sleeve. */}
          <div className="absolute inset-[31%] overflow-hidden rounded-full ring-[0.4cqw] ring-black/60">
            <Artwork
              hash={hash}
              seed={seed}
              rounded="full"
              className="h-full w-full"
            />
          </div>
          <div className="absolute inset-[48.6%] rounded-full bg-obsidian ring-1 ring-white/20" />
        </div>
        {/* Static light sheen across the grooves (does not rotate). */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 210deg, transparent 0deg, rgb(255 255 255 / 0.16) 25deg, transparent 60deg, transparent 180deg, rgb(255 255 255 / 0.11) 210deg, transparent 245deg)",
          }}
        />
      </div>

      {/* Sleeve */}
      <div
        className="absolute inset-y-0 left-0 aspect-square overflow-hidden rounded-[0.4cqw] shadow-[0_2.4cqw_5cqw_-1.6cqw_rgb(0_0_0/0.85)] [container-type:inline-size]"
        style={{
          backgroundColor: "#e9ebe6",
          backgroundImage: `${PAPER}, linear-gradient(135deg, #f0f1eb 0%, #dfe2dc 100%)`,
        }}
      >
        {!bare && !fullBleed && artist && (
          <p
            className="absolute inset-x-[8%] top-[9.5%] truncate text-center font-caps leading-none tracking-[0.32em] uppercase"
            style={{ fontSize: "2.5cqw", color: inkFor(accent, seed) }}
            dir="auto"
          >
            {artist}
          </p>
        )}
        <div
          className={cn(
            "absolute overflow-hidden shadow-[0_0.6cqw_1.6cqw_-0.6cqw_rgb(0_0_0/0.35)]",
            fullBleed
              ? "inset-[2.5%]"
              : bare
                ? "inset-[13%]"
                : "inset-x-[14.5%] top-[18.5%] bottom-[27.5%]",
          )}
        >
          {inset ?? (
            <Artwork
              hash={hash}
              seed={seed}
              size={size}
              rounded="none"
              className="h-full w-full"
            />
          )}
        </div>
        {!bare && !fullBleed && title && (
          <p
            className="absolute inset-x-[8%] bottom-[9.5%] truncate text-center font-caps leading-none tracking-[0.32em] uppercase"
            style={{ fontSize: "2.5cqw", color: inkFor(accent, seed) }}
            dir="auto"
          >
            {title}
          </p>
        )}
        {/* Subtle print edge and light falloff across the card stock. */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgb(255_255_255/0.18),transparent_40%,rgb(0_0_0/0.06))] ring-1 ring-black/10 ring-inset" />
      </div>
    </div>
  );
});
