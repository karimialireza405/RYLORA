import { memo, useState, type CSSProperties } from "react";

import { artworkUrl, type ArtworkSize } from "@/services/artwork";
import { cn, hueOf } from "@/utils/cn";

interface ArtworkProps {
  hash: string | null | undefined;
  /** Used to derive a stable placeholder colour when there is no cover. */
  seed: string;
  size?: ArtworkSize;
  className?: string;
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full";
  alt?: string;
  accent?: string | null;
}

const radius = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
} as const;

/**
 * Album artwork with a designed placeholder: a dark, seed-tinted gradient carrying
 * RYLORA's ring motif, so missing covers still look intentional.
 */
export const Artwork = memo(function Artwork({
  hash,
  seed,
  size = "sm",
  className,
  rounded = "md",
  alt = "",
  accent,
}: ArtworkProps) {
  const src = artworkUrl(hash, size);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;
  const showImage = src && failedSrc !== src;
  const hue = hueOf(seed);

  return (
    <div
      className={cn(
        "artwork-glow relative isolate shrink-0 overflow-hidden bg-raised",
        radius[rounded],
        className,
      )}
      style={{ "--art-tint": accent ?? "#c1c7d2" } as CSSProperties}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {(!showImage || !loaded) && <Placeholder hue={hue} />}
      {showImage && (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-(--duration-emphasis) ease-(--ease-out)",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {/* Hairline inner edge keeps dark covers from bleeding into dark surfaces. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 ring-1 ring-white/6 ring-inset",
          radius[rounded],
        )}
      />
    </div>
  );
});

function Placeholder({ hue }: { hue: number }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `radial-gradient(120% 90% at 85% 10%, hsl(${hue} 45% 30% / 0.55), transparent 60%),
                     linear-gradient(145deg, hsl(${hue} 30% 16%), hsl(${(hue + 30) % 360} 35% 8%))`,
      }}
    >
      <svg
        viewBox="0 0 64 64"
        className="absolute inset-0 m-auto h-[46%] w-[46%] opacity-30"
        fill="none"
        aria-hidden
      >
        <path
          d="M 32 9.5 A 22.5 22.5 0 1 1 12.3 42.9"
          stroke={`hsl(${hue} 60% 80%)`}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M 32 19.4 A 12.6 12.6 0 1 1 20.4 37"
          stroke={`hsl(${hue} 60% 80%)`}
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.6"
        />
        <circle cx="32" cy="32" r="3.4" fill={`hsl(${hue} 60% 88%)`} />
      </svg>
    </div>
  );
}

/** 2×2 mosaic for playlists; falls back gracefully with fewer covers. */
export function Mosaic({
  hashes,
  seed,
  className,
  size = "sm",
}: {
  hashes: string[];
  seed: string;
  className?: string;
  size?: ArtworkSize;
}) {
  if (hashes.length < 4) {
    return (
      <Artwork
        hash={hashes[0] ?? null}
        seed={seed}
        size={size}
        className={className}
      />
    );
  }
  return (
    <div
      className={cn(
        "relative grid shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-md bg-raised",
        className,
      )}
      aria-hidden
    >
      {hashes.slice(0, 4).map((h) => (
        <Artwork
          key={h}
          hash={h}
          seed={seed}
          size="sm"
          rounded="none"
          className="h-full w-full"
        />
      ))}
    </div>
  );
}
