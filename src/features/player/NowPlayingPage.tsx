import {
  Heart,
  ListMusic,
  ListPlus,
  Maximize2,
  MicVocal,
  Music2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { Page } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Button, IconButton } from "@/components/ui/Button";
import { DropdownMenuButton } from "@/components/ui/Menu";
import { playlistSubmenu } from "@/features/library/trackMenu";
import { SpectrumVisualizer } from "@/features/visualizer/SpectrumVisualizer";
import { backend } from "@/services/backend";
import { setFavorite, useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { player, usePlayer } from "@/stores/player";
import { prefEnabled, useUi } from "@/stores/ui";
import type { Track } from "@/types/domain";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { VinylCover } from "@/components/ui/VinylCover";
import { LibraryCover } from "@/components/ui/LibraryCover";
import { cn } from "@/utils/cn";
import { formatTime } from "@/utils/format";
import { ProgressBar, TransportControls, VolumeControl } from "./Controls";
import { messages } from "@/i18n";

export function NowPlayingPage() {
  const current = usePlayer((s) => s.current);
  const track = useLibrary((s) =>
    current ? (s.trackById.get(current.id) ?? current) : null,
  );
  const lyricsOpen = useUi((s) => s.lyricsOpen);
  const ambient = useUi((s) => prefEnabled(s.prefs, "ambientBackground"));
  // The side column needs room; narrower windows keep the stage wide and offer "Next up" inline.
  const wide = useMediaQuery("(min-width: 1600px)");
  const showAside = wide || lyricsOpen;
  const playing = usePlayer((s) => s.status === "playing");
  const reduced = useReducedMotion();

  if (!track) {
    return (
      <Page>
        <EmptyState
          icon={Music2}
          title={messages().player.nothingPlaying}
          description={messages().player.nothingPlayingHint}
          className="pt-28"
        >
          <Button
            variant="primary"
            onClick={() => navigate({ name: "library", tab: "songs" })}
          >
            {messages().player.browseSongs}
          </Button>
        </EmptyState>
      </Page>
    );
  }

  const accent = track.accent ?? "#e8ebf0";

  return (
    <div className="relative min-h-full overflow-hidden">
      {ambient && <AmbientWash accent={accent} trackKey={track.id} />}

      <div
        className={cn(
          "relative mx-auto grid min-h-[calc(100dvh-var(--playbar-height)-var(--titlebar-height))] w-full max-w-[1680px] gap-7 px-7 pt-7 pb-7",
          showAside && wide
            ? "grid-cols-[minmax(0,1fr)_minmax(280px,320px)]"
            : "grid-cols-1",
        )}
      >
        <section aria-label={messages().player.nowPlaying} className="flex min-w-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-wrap items-center gap-7 xl:gap-9">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={track.id}
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
                className="relative shrink-0"
              >
                <div
                  aria-hidden
                  className="absolute -inset-6 rounded-[28px] opacity-15"
                  style={{
                    background: `radial-gradient(closest-side, color-mix(in srgb, ${accent} 45%, transparent), transparent)`,
                  }}
                />
                <VinylCover
                  fullBleed
                  hash={track.artwork}
                  seed={track.album}
                  artist={track.artist}
                  title={track.album}
                  accent={track.accent}
                  out
                  spinning={playing && !reduced}
                  alt={messages().player.coverAlt(track.album, track.artist)}
                  className="relative"
                  style={coverSize(
                    showAside
                      ? "clamp(190px, min(35vh, 19vw), 360px)"
                      : "clamp(210px, min(40vh, 24vw), 420px)",
                  )}
                />
              </motion.div>
            </AnimatePresence>

            <div className="min-w-[240px] flex-1">
              <p className="caps text-[10px] text-ink-3 uppercase">
                {messages().player.nowPlaying}
              </p>
              <h1
                className={cn("bidi",
                  "glow-room mt-2 line-clamp-2 font-display font-light glow tracking-[-0.01em] text-ink text-balance",
                  track.title.length > 24 ? "text-display" : "text-hero",
                )}
              >
                {track.title}
              </h1>
              <p className="mt-3 truncate text-title text-ink-2">
                <button
                  type="button"
                  onClick={() =>
                    navigate({ name: "artist", id: track.artistId })
                  }
                  className="font-medium hover:text-ink hover:underline"
                >
                  {track.artist}
                </button>
              </p>
              <p className="mt-1 truncate text-body text-ink-3">
                <button
                  type="button"
                  onClick={() => navigate({ name: "album", id: track.albumId })}
                  className="bidi hover:text-ink-2 hover:underline"
                >
                  {track.album}
                </button>
                {track.year && <span> · {track.year}</span>}
                <span className="ms-2 rounded-xs px-1.5 py-px align-[1px] text-caption font-semibold tracking-wide text-ink-3 uppercase ring-1 ring-line-strong">
                  {track.format}
                </span>
              </p>

              <div className="mt-8 flex items-center gap-1.5">
                <IconButton
                  icon={Heart}
                  label={
                    track.favorite
                      ? messages().common.removeFromFavorites
                      : messages().common.addToFavorites
                  }
                  shortcut="Ctrl+L"
                  aria-pressed={track.favorite}
                  className={cn(
                    track.favorite && "text-violet-soft hover:text-violet-soft",
                  )}
                  iconClassName={cn(track.favorite && "fill-current")}
                  onClick={() => void setFavorite([track.id], !track.favorite)}
                />
                <DropdownMenuButton
                  align="start"
                  entries={() => [playlistSubmenu([track.id])]}
                >
                  <IconButton icon={ListPlus} label={messages().player.addToPlaylist} />
                </DropdownMenuButton>
                <IconButton
                  icon={MicVocal}
                  label={lyricsOpen ? messages().player.hideLyrics : messages().player.showLyrics}
                  active={lyricsOpen}
                  aria-pressed={lyricsOpen}
                  onClick={() => useUi.setState({ lyricsOpen: !lyricsOpen })}
                />
                <IconButton
                  icon={Maximize2}
                  label={messages().common.immersive}
                  shortcut="F11"
                  onClick={() => useUi.setState({ immersive: true })}
                />
              </div>

              <div className="mt-8 max-w-[560px]">
                <ProgressBar size="lg" />
                <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                  <TransportControls size="lg" />
                  <VolumeControl width="w-24" />
                </div>
                {!showAside && <NextUpLine />}
              </div>
            </div>
          </div>

          <div className="relative mt-6 h-24 shrink-0">
            <SpectrumVisualizer
              variant="mirror"
              className="absolute inset-x-0 bottom-0 h-[clamp(180px,28vh,280px)]!"
            />
          </div>
        </section>

        {showAside && (
          <aside
            className="flex min-h-0 flex-col"
            aria-label={lyricsOpen ? messages().player.lyrics : messages().player.upNext}
          >
            {lyricsOpen ? <LyricsPanel track={track} /> : <UpNext />}
          </aside>
        )}
      </div>
    </div>
  );
}

/** Vinyl covers are sized by sleeve height; the disc adds 30 % width. */
function coverSize(height: string) {
  return { height, width: `calc(${height} * 1.3)` };
}

/** Artwork-derived light: two soft radial pools that cross-fade between tracks. */
export function AmbientWash({
  accent,
  trackKey,
  drift,
}: {
  accent: string;
  trackKey: number;
  drift?: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={trackKey}
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
        className="pointer-events-none absolute inset-0"
      >
        <div
          className={cn(
            "absolute -top-1/4 -left-1/4 h-[90%] w-[80%] rounded-full",
            drift && "animate-[ambient-drift_38s_ease-in-out_infinite]",
          )}
          style={{
            background: `radial-gradient(closest-side, color-mix(in srgb, ${accent} 8%, transparent), transparent)`,
          }}
        />
        <div
          className={cn(
            "absolute -right-1/4 -bottom-1/3 h-[80%] w-[70%] rounded-full",
            drift && "animate-[ambient-drift_46s_ease-in-out_infinite_reverse]",
          )}
          style={{
            background: `radial-gradient(closest-side, color-mix(in srgb, ${accent} 4%, transparent), transparent)`,
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,var(--color-obsidian)_100%)]" />
      </motion.div>
    </AnimatePresence>
  );
}

/** Compact "next up" for narrower windows; opens the full queue. */
function NextUpLine() {
  const next = usePlayer((s) =>
    s.cursor === null ? undefined : s.queue[s.cursor + 1],
  );
  const track = useLibrary((s) =>
    next ? s.trackById.get(next.trackId) : undefined,
  );
  if (!track) return null;
  return (
    <button
      type="button"
      onClick={() => useUi.setState({ queueOpen: true })}
      className="mt-7 flex max-w-full items-center gap-3 rounded-full bg-deep/70 py-1.5 pe-4 ps-1.5 text-start ring-1 ring-line ring-inset backdrop-blur-sm transition-colors hover:bg-raised"
    >
      <LibraryCover
        hash={track.artwork}
        seed={track.album}
        className="h-8 w-[42px] shrink-0"
      />
      <span className="caps text-[10px] text-ink-4 uppercase">{messages().player.nextUp}</span>
      <span className="min-w-0 truncate text-meta text-ink-2">
        <bdi>{track.title}</bdi> <span className="text-ink-4">·</span> <bdi>{track.artist}</bdi>
      </span>
    </button>
  );
}

function UpNext() {
  const queue = usePlayer((s) => s.queue);
  const cursor = usePlayer((s) => s.cursor);
  const trackById = useLibrary((s) => s.trackById);
  const upcoming = useMemo(
    () =>
      (cursor === null ? [] : queue.slice(cursor + 1, cursor + 9))
        .map((e) => ({ entry: e, track: trackById.get(e.trackId) }))
        .filter((r): r is { entry: typeof r.entry; track: Track } => !!r.track),
    [queue, cursor, trackById],
  );
  const total = cursor === null ? 0 : queue.length - cursor - 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-deep/70 p-4 ring-1 ring-line ring-inset backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="font-display text-title font-normal tracking-[-0.01em]">
          {messages().player.upNext}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          icon={ListMusic}
          onClick={() => useUi.setState({ queueOpen: true })}
        >
          {messages().player.queueCount(total)}
        </Button>
      </div>
      {upcoming.length === 0 ? (
        <p className="px-1 py-6 text-meta text-ink-3">
          {messages().player.nothingQueued}
        </p>
      ) : (
        <ul className="min-h-0 space-y-0.5 overflow-y-auto">
          {upcoming.map(({ entry, track }) => (
            <li key={entry.uid}>
              <button
                type="button"
                onClick={() => player.jumpTo(entry.uid)}
                className="flex w-full items-center gap-3 rounded-md p-2 text-start transition-colors hover:bg-raised/80"
              >
                <LibraryCover
                  hash={track.artwork}
                  seed={track.album}
                  className="h-10 w-[52px] shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className="bidi block truncate text-body font-medium text-ink"
                  >
                    {track.title}
                  </span>
                  <span className="bidi block truncate text-meta text-ink-3">
                    {track.artist}
                  </span>
                </span>
                <span className="tabular text-caption text-ink-4">
                  {formatTime(track.durationMs)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LyricsPanel({ track }: { track: Track }) {
  const [state, setState] = useState<{
    id: number;
    text: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    backend()
      .player.lyrics(track.id)
      .then((text) => !cancelled && setState({ id: track.id, text }))
      .catch(() => !cancelled && setState({ id: track.id, text: null }));
    return () => {
      cancelled = true;
    };
  }, [track.id]);

  const loading = !state || state.id !== track.id;
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-deep/70 p-5 ring-1 ring-line ring-inset backdrop-blur-sm">
      <h2 className="mb-4 font-display text-title font-normal tracking-[-0.01em]">
        {messages().player.lyrics}
      </h2>
      {loading ? (
        <p className="text-meta text-ink-3">{messages().player.readingTags}</p>
      ) : state.text ? (
        <p
          className="bidi selectable min-h-0 flex-1 overflow-y-auto pe-2 text-lead leading-8 whitespace-pre-line text-ink-2"
        >
          {state.text}
        </p>
      ) : (
        <div className="py-6">
          <p className="text-body text-ink-2">{messages().player.noLyrics}</p>
          <p className="mt-1.5 text-meta text-ink-3">
            {messages().player.lyricsHint}
          </p>
        </div>
      )}
    </div>
  );
}
