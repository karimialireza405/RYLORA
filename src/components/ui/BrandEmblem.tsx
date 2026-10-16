import { useId } from "react";

import { cn } from "@/utils/cn";

/**
 * The RYLORA mark as live SVG: a record sleeve with a semicircular die-cut and the
 * disc inside showing through it. Same geometry as `assets/brand/mark.svg`.
 *
 * - `intro`: the disc slides out of the sleeve and the mark lights up (start-up).
 * - `spin`: the disc turns, with a moving sheen so the turning is visible (busy).
 * - `static`: no motion.
 * Motion stops under the reduced-motion preference (global CSS rule).
 */
export function BrandEmblem({
  size = 48,
  motion = "static",
  glow = true,
  className,
}: {
  size?: number;
  motion?: "static" | "intro" | "spin";
  glow?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
      data-motion={motion}
      className={cn("brand-emblem overflow-visible", glow && "brand-emblem-glow", className)}
    >
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4F6F9" />
          <stop offset="1" stopColor="#C3C9D3" />
        </linearGradient>
        <radialGradient id={`${id}d`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.3" stopColor="#26282E" />
          <stop offset="1" stopColor="#121317" />
        </radialGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="brand-emblem-disc">
        <circle cx="42" cy="32" r="19" fill={`url(#${id}d)`} />
        <circle cx="42" cy="32" r="18.3" fill="none" stroke="#AEB4BF" strokeWidth="1.4" />
        <circle cx="42" cy="32" r="14.8" fill="none" stroke="#5A5F6A" strokeWidth="0.9" />
        <circle cx="42" cy="32" r="11.4" fill="none" stroke="#5A5F6A" strokeWidth="0.9" />
        <g className="brand-emblem-spinner">
          <path d="M42 15.5 A16.5 16.5 0 0 1 58.5 32" fill="none" stroke={`url(#${id}h)`} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="42" cy="32" r="4.6" fill="var(--now-tint, #E8EBF0)" />
          <circle cx="44.6" cy="32" r="0.7" fill="#121317" opacity="0.5" />
        </g>
        <circle cx="42" cy="32" r="1.2" fill="#121317" />
      </g>
      <path d="M6 13 H42 V24.5 A7.5 7.5 0 0 0 42 39.5 V51 H6 Z" fill={`url(#${id}s)`} />
      <path d="M6 13 H42" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="0.8" />
    </svg>
  );
}
