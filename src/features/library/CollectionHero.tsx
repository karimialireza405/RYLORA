import type { ReactNode } from "react";

import { cn } from "@/utils/cn";
import { isRtl } from "@/utils/format";

/**
 * Header for albums, artists and playlists: artwork-led, lit by the artwork's
 * accent colour. The wash is a static gradient (no blur filter) so it is cheap.
 */
export function CollectionHero({
  art,
  overline,
  title,
  meta,
  actions,
  accent,
  onTitleClick,
}: {
  art: ReactNode;
  overline: string;
  title: string;
  meta: ReactNode;
  actions: ReactNode;
  accent?: string | null;
  onTitleClick?: () => void;
}) {
  const tint = accent ?? "#e8ebf0";
  const rtl = isRtl(title);
  const size = title.length > 28 ? "text-display" : "text-hero";
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${tint} 7%, var(--color-obsidian)) 0%, transparent 80%)`,
        }}
      />
      <div className="relative mx-auto flex w-full max-w-[1680px] items-end gap-6 px-6 pt-7 pb-7">
        <div className="shrink-0">{art}</div>
        <div className="min-w-0 pb-1">
          <p className="caps text-[10px] text-ink-2 uppercase">{overline}</p>
          {onTitleClick ? (
            <button type="button" onClick={onTitleClick} className="mt-2 block max-w-full rounded-xs text-left" title="Rename">
              <TitleText title={title} size={size} rtl={rtl} />
            </button>
          ) : (
            <div className="mt-2">
              <TitleText title={title} size={size} rtl={rtl} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink-2">{meta}</div>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">{actions}</div>
        </div>
      </div>
    </div>
  );
}

function TitleText({ title, size, rtl }: { title: string; size: string; rtl: boolean }) {
  return (
    <h1
      dir={rtl ? "rtl" : undefined}
      className={cn("glow glow-room line-clamp-2 font-display font-light tracking-[-0.01em] text-ink text-balance", size, rtl && "text-left")}
    >
      {title}
    </h1>
  );
}

export function Dot() {
  return (
    <span className="text-ink-4" aria-hidden>
      ·
    </span>
  );
}
