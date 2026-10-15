import { Heart, ListMusic, Maximize2, MonitorPlay } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { LibraryCover } from "@/components/ui/LibraryCover";
import { IconButton } from "@/components/ui/Button";
import {
  ProgressBar,
  TransportControls,
  VolumeControl,
} from "@/features/player/Controls";
import { setFavorite, useLibrary } from "@/stores/library";
import { navigate, useRoute } from "@/stores/navigation";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { cn } from "@/utils/cn";
import { isRtl } from "@/utils/format";

/** Persistent transport bar. Lives outside page routing so it never unmounts. */
export function PlaybackBar() {
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.status === "playing");
  // Prefer the library copy so favourite toggles reflect immediately.
  const track = useLibrary((s) =>
    current ? (s.trackById.get(current.id) ?? current) : null,
  );
  const queueOpen = useUi((s) => s.queueOpen);
  const route = useRoute();

  return (
    <footer
      aria-label="Playback"
      className="relative z-40 grid h-[var(--playbar-height)] grid-cols-[minmax(200px,1fr)_minmax(320px,1.6fr)_minmax(190px,1fr)] items-center gap-4 border-t border-line bg-base px-5"
    >
      {/* Now playing */}
      <div className="flex min-w-0 items-center gap-3.5">
        <AnimatePresence mode="wait" initial={false}>
          {track ? (
            <motion.button
              key={track.id}
              type="button"
              onClick={() => navigate({ name: "nowPlaying" })}
              aria-label="Open Now Playing"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="group relative shrink-0 rounded-md"
            >
              <LibraryCover
                hash={track.artwork}
                seed={track.album}
                pulse={playing}
                className="h-14 w-[73px]"
              />
              <span className="absolute inset-y-0 left-0 flex aspect-square items-center justify-center rounded-sm bg-obsidian/55 opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="size-4 text-ink" aria-hidden />
              </span>
            </motion.button>
          ) : (
            <div
              className="h-12 w-[62px] shrink-0 rounded-md bg-deep ring-1 ring-line ring-inset"
              aria-hidden
            />
          )}
        </AnimatePresence>
        <div className="min-w-0">
          {track ? (
            <>
              <button
                type="button"
                onClick={() => navigate({ name: "album", id: track.albumId })}
                dir={isRtl(track.title) ? "rtl" : undefined}
                title={track.title}
                className="block max-w-full truncate text-left text-body font-semibold text-ink hover:underline"
              >
                {track.title}
              </button>
              <button
                type="button"
                onClick={() => navigate({ name: "artist", id: track.artistId })}
                className="block max-w-full truncate text-left text-meta text-ink-3 hover:text-ink-2 hover:underline"
              >
                {track.artist}
              </button>
            </>
          ) : (
            <>
              <p className="text-body font-medium text-ink-3">
                Nothing playing
              </p>
              <p className="text-meta text-ink-4">
                Pick a song to start listening
              </p>
            </>
          )}
        </div>
        {track && (
          <IconButton
            icon={Heart}
            label={
              track.favorite ? "Remove from favorites" : "Add to favorites"
            }
            shortcut="Ctrl+L"
            size="sm"
            aria-pressed={track.favorite}
            className={cn(
              track.favorite && "text-violet-soft hover:text-violet-soft",
            )}
            iconClassName={cn(track.favorite && "fill-current")}
            onClick={() => void setFavorite([track.id], !track.favorite)}
          />
        )}
      </div>

      {/* Transport */}
      <div className="flex min-w-0 flex-col items-center gap-1">
        <TransportControls />
        <ProgressBar className="max-w-[640px]" />
      </div>

      {/* Secondary */}
      <div className="flex items-center justify-end gap-1">
        <IconButton
          icon={MonitorPlay}
          label="Now Playing"
          active={route.name === "nowPlaying"}
          aria-pressed={route.name === "nowPlaying"}
          size="sm"
          disabled={!track}
          onClick={() => navigate({ name: "nowPlaying" })}
        />
        <IconButton
          icon={ListMusic}
          label="Queue"
          data-track-drop="queue"
          shortcut="Q"
          size="sm"
          active={queueOpen}
          aria-expanded={queueOpen}
          aria-controls="queue-panel"
          onClick={() => useUi.setState({ queueOpen: !queueOpen })}
        />
        <IconButton
          icon={Maximize2}
          label="Immersive mode"
          shortcut="F11"
          size="sm"
          disabled={!track}
          onClick={() => useUi.setState({ immersive: true })}
        />
        <VolumeControl className="ml-2" />
      </div>
    </footer>
  );
}
