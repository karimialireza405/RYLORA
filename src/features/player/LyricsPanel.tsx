import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { messages } from "@/i18n";
import { backend } from "@/services/backend";
import { player, usePlayer, useProgress } from "@/stores/player";
import type { Lyrics, LyricLine, Track } from "@/types/domain";
import { cn } from "@/utils/cn";
import { formatTime } from "@/utils/format";
import { activeLineIndex, interpolatePosition } from "./lyrics";

/** After the listener scrolls the lyrics themselves, follow the song again after this long. */
const MANUAL_SCROLL_HOLD_MS = 4000;

export function LyricsPanel({ track }: { track: Track }) {
  const [state, setState] = useState<{ id: number; lyrics: Lyrics | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    backend()
      .player.lyrics(track.id)
      .then((lyrics) => !cancelled && setState({ id: track.id, lyrics }))
      .catch(() => !cancelled && setState({ id: track.id, lyrics: null }));
    return () => {
      cancelled = true;
    };
  }, [track.id]);

  const loading = !state || state.id !== track.id;
  const lyrics = loading ? null : state.lyrics;
  const t = messages().player;
  const source = lyrics
    ? lyrics.synced
      ? lyrics.source === "file"
        ? t.syncedFromFile
        : t.syncedFromTags
      : lyrics.source === "file"
        ? t.lyricsFromFile
        : t.lyricsFromTags
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-deep/70 p-5 ring-1 ring-line ring-inset backdrop-blur-sm">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-title font-normal tracking-[-0.01em]">{t.lyrics}</h2>
        {source && <span className="text-caption text-ink-4">{source}</span>}
      </div>
      {loading ? (
        <p className="text-meta text-ink-3">{t.readingTags}</p>
      ) : lyrics?.synced ? (
        <SyncedLyrics key={track.id} lines={lyrics.lines} />
      ) : lyrics ? (
        <p className="bidi selectable min-h-0 flex-1 overflow-y-auto pe-2 text-lead leading-8 whitespace-pre-line text-ink-2">
          {lyrics.lines.map((l) => l.text).join("\n")}
        </p>
      ) : (
        <div className="py-6">
          <p className="text-body text-ink-2">{t.noLyrics}</p>
          <p className="mt-1.5 text-meta text-ink-3">{t.lyricsHint}</p>
        </div>
      )}
    </div>
  );
}

/** Follows the playing position; the current line is lit and kept in view. Click a line to jump to it. */
function SyncedLyrics({ lines }: { lines: LyricLine[] }) {
  const playing = usePlayer((s) => s.status === "playing");
  const reduced = useReducedMotion();
  const [active, setActive] = useState(() => activeLineIndex(lines, useProgress.getState().positionMs));
  const container = useRef<HTMLOListElement>(null);
  const heldUntil = useRef(0);

  // Track the position between the backend's 250 ms progress updates.
  useEffect(() => {
    let reported = useProgress.getState();
    let reportedAt = performance.now();
    const unsubscribe = useProgress.subscribe((p) => {
      reported = p;
      reportedAt = performance.now();
    });
    const update = () => {
      const now = performance.now();
      const ms = interpolatePosition(reported.positionMs, reportedAt, now, playing, reported.durationMs);
      setActive(activeLineIndex(lines, ms));
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [lines, playing]);

  // Keep the current line centred unless the listener is reading elsewhere.
  useEffect(() => {
    const list = container.current;
    if (!list || active < 0 || performance.now() < heldUntil.current) return;
    const item = list.children[active] as HTMLElement | undefined;
    if (!item) return;
    const top = item.offsetTop - list.clientHeight / 2 + item.clientHeight / 2;
    list.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  }, [active, reduced]);

  // Half a panel of space above and below, so the first and last lines can sit in the middle too.
  useEffect(() => {
    const list = container.current;
    if (!list) return;
    const pad = () => {
      list.style.paddingBlock = `${Math.round(list.clientHeight / 2 - 24)}px`;
    };
    pad();
    const observer = new ResizeObserver(pad);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const hold = () => {
    heldUntil.current = performance.now() + MANUAL_SCROLL_HOLD_MS;
  };

  return (
    <ol
      ref={container}
      onWheel={hold}
      onTouchMove={hold}
      aria-label={messages().player.lyrics}
      className="relative min-h-0 flex-1 overflow-y-auto pe-2 [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]"
    >
      {lines.map((line, i) => {
        const current = i === active;
        const time = line.timeMs ?? 0;
        return (
          <li key={i}>
            <button
              type="button"
              aria-current={current ? "true" : undefined}
              title={formatTime(time)}
              onClick={() => {
                heldUntil.current = 0;
                player.seek(time);
              }}
              className={cn(
                "bidi block w-full rounded-md px-2 py-1.5 text-lead leading-7 transition-[color,opacity,transform] duration-300 ease-(--ease-out) hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-blue-soft",
                current
                  ? "glow-live font-medium text-ink opacity-100 motion-safe:scale-[1.02]"
                  : i < active
                    ? "text-ink-3 opacity-60"
                    : "text-ink-2 opacity-80",
              )}
            >
              {line.text || <span aria-hidden className="tracking-[0.4em] text-ink-4">•••</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
