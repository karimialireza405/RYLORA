import { ArrowUpRight, Heart, MoreHorizontal, Pencil, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { LibraryCover } from "@/components/ui/LibraryCover";
import { VinylCover } from "@/components/ui/VinylCover";
import { Button, IconButton } from "@/components/ui/Button";
import { DropdownMenuButton } from "@/components/ui/Menu";
import { buildTrackMenu } from "@/features/library/trackMenu";
import { QueuePanel } from "@/features/queue/QueuePanel";
import { SpectrumVisualizer } from "@/features/visualizer/SpectrumVisualizer";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { setFavorite, useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { player, usePlayer } from "@/stores/player";
import { setPreference, useUi } from "@/stores/ui";
import { cn } from "@/utils/cn";
import { formatTime, plural } from "@/utils/format";

export function ListeningPanel() {
  const current = usePlayer((s) => s.current),
    queue = usePlayer((s) => s.queue),
    cursor = usePlayer((s) => s.cursor);
  const tracks = useLibrary((s) => s.trackById),
    playing = usePlayer((s) => s.status === "playing");
  const storedWidth = useUi((s) => s.prefs.panelWidth),
    tab = useUi((s) => s.listeningTab),
    queueOpen = useUi((s) => s.queueOpen);
  const reduced = useReducedMotion(),
    [dragWidth, setDragWidth] = useState<number | null>(null);
  const start = useRef<{ x: number; width: number } | null>(null);
  const width =
    dragWidth ?? Math.max(280, Math.min(400, Number(storedWidth) || 320));
  const activeTab = queueOpen ? "queue" : tab === "queue" ? "playing" : tab;
  const next = useMemo(
    () =>
      (cursor === null ? queue : queue.slice(cursor + 1)).flatMap((entry) => {
        const t = tracks.get(entry.trackId);
        return t ? [{ entry, track: t }] : [];
      }),
    [queue, cursor, tracks],
  );
  if (!current) return null;
  const track = tracks.get(current.id) ?? current;
  const select = (value: "playing" | "queue" | "info") =>
    useUi.setState({ listeningTab: value, queueOpen: value === "queue" });
  const clamp = (n: number) => Math.max(280, Math.min(400, n));
  return (
    <aside
      aria-label="Listening panel"
      className="relative flex h-full shrink-0 flex-col border-l border-line bg-base"
      style={{ width }}
    >
      <div
        role="separator"
        aria-label="Resize listening panel"
        aria-orientation="vertical"
        aria-valuemin={280}
        aria-valuemax={400}
        aria-valuenow={width}
        tabIndex={0}
        className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none hover:bg-blue/20 focus-visible:bg-blue/20"
        onPointerDown={(e) => {
          start.current = { x: e.clientX, width };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current)
            setDragWidth(
              clamp(start.current.width + start.current.x - e.clientX),
            );
        }}
        onPointerUp={(e) => {
          if (start.current) {
            void setPreference("panelWidth", String(width));
            start.current = null;
            setDragWidth(null);
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragWidth(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            void setPreference(
              "panelWidth",
              String(clamp(width + (e.key === "ArrowLeft" ? 16 : -16))),
            );
          }
        }}
      />
      <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-2">
        <h2 className="text-heading font-bold">Listening</h2>
        <IconButton
          icon={X}
          label="Close listening panel"
          size="xs"
          onClick={() => {
            useUi.setState({ nowPlayingPanelOpen: false, queueOpen: false });
            void setPreference("panelVisible", "false");
          }}
        />
      </div>
      <div
        role="tablist"
        aria-label="Listening view"
        className="collection-tabs mx-5 shrink-0 gap-5!"
      >
        {(["playing", "queue", "info"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`listening-${value}-tab`}
            aria-controls="listening-content"
            aria-selected={activeTab === value}
            tabIndex={activeTab === value ? 0 : -1}
            onKeyDown={(e) => {
              const values = ["playing", "queue", "info"] as const;
              let i = values.indexOf(value);
              if (e.key === "ArrowRight") i = (i + 1) % 3;
              else if (e.key === "ArrowLeft") i = (i + 2) % 3;
              else if (e.key === "Home") i = 0;
              else if (e.key === "End") i = 2;
              else return;
              e.preventDefault();
              select(values[i]!);
              document.getElementById(`listening-${values[i]}-tab`)?.focus();
            }}
            data-track-drop={value === "queue" ? "queue" : undefined}
            onClick={() => select(value)}
          >
            {value === "playing"
              ? "Now playing"
              : value === "queue"
                ? "Queue"
                : "Info"}
          </button>
        ))}
      </div>
      <div
        id="listening-content"
        role="tabpanel"
        aria-labelledby={`listening-${activeTab}-tab`}
        className="min-h-0 flex-1"
      >
        {activeTab === "queue" ? (
          <QueuePanel embedded />
        ) : activeTab === "info" ? (
          <div className="h-full overflow-x-hidden overflow-y-auto p-5">
            <LibraryCover
              hash={track.artwork}
              seed={track.album}
              large
              className="w-full"
            />
            <h3
              dir="auto"
              className="mt-5 selectable text-heading font-bold [overflow-wrap:anywhere]"
            >
              {track.title}
            </h3>
            <dl className="mt-5 space-y-4 text-meta">
              {[
                ["Artist", track.artist],
                ["Album", track.album],
                ["Album artist", track.albumArtist],
                ["Year", track.year],
                ["Genre", track.genre],
                ["Format", track.format.toUpperCase()],
                ["Duration", formatTime(track.durationMs)],
                ["File", track.path],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-caption text-ink-3">{label}</dt>
                  <dd
                    dir="auto"
                    className="selectable mt-1 break-words text-ink"
                  >
                    {value ?? "Not specified"}
                  </dd>
                </div>
              ))}
            </dl>
            {track.missing && (
              <p className="mt-4 text-meta text-warning">
                File unavailable. Reconnect its drive or rescan your library.
              </p>
            )}
            <Button
              icon={Pencil}
              className="mt-6"
              onClick={() => useUi.setState({ editTrackId: track.id })}
            >
              Edit song information
            </Button>
          </div>
        ) : (
          <div className="h-full overflow-x-hidden overflow-y-auto px-5 pt-5 pb-5">
            <button
              type="button"
              className="block w-full rounded-sm"
              aria-label="Open full player"
              onClick={() => navigate({ name: "nowPlaying" })}
            >
              <VinylCover
                hash={track.artwork}
                seed={track.album}
                fullBleed
                accent={track.accent}
                out
                spinning={playing && !reduced}
                className="w-full"
              />
            </button>
            <div className="relative mt-2 h-12">
              <SpectrumVisualizer
                variant="mirror"
                coarse
                className="absolute inset-x-0 bottom-0 h-[200px]!"
              />
            </div>
            <div className="mt-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3
                  dir="auto"
                  className="selectable text-heading font-bold leading-tight [overflow-wrap:anywhere]"
                >
                  {track.title}
                </h3>
                <button
                  type="button"
                  dir="auto"
                  title={track.artist}
                  className="mt-1.5 max-w-full truncate text-body text-ink-3 hover:text-ink hover:underline"
                  onClick={() =>
                    navigate({ name: "artist", id: track.artistId })
                  }
                >
                  {track.artist}
                </button>
              </div>
              <IconButton
                icon={Heart}
                label={
                  track.favorite ? "Remove from favorites" : "Add to favorites"
                }
                aria-pressed={track.favorite}
                size="sm"
                className={cn(track.favorite && "text-blue-soft")}
                iconClassName={cn(track.favorite && "fill-current")}
                onClick={() => void setFavorite([track.id], !track.favorite)}
              />
              <DropdownMenuButton
                entries={() =>
                  buildTrackMenu({
                    tracks: [track],
                    play: () => player.playTracks([track.id]),
                  })
                }
              >
                <IconButton
                  icon={MoreHorizontal}
                  label="Song options"
                  size="xs"
                />
              </DropdownMenuButton>
            </div>
            <button
              type="button"
              dir="auto"
              title={track.album}
              className="mt-3 max-w-full truncate text-meta text-ink-3 underline hover:text-ink"
              onClick={() => navigate({ name: "album", id: track.albumId })}
            >
              {track.album}
            </button>
            <div className="mt-6 flex items-center justify-between border-t border-line pt-5">
              <h3 className="text-lead font-bold">Up next</h3>
              <span className="text-caption text-ink-3">
                {plural(next.length, "track")}
              </span>
            </div>
            {next.length ? (
              <ul className="mt-3">
                {next.slice(0, 3).map(({ entry, track: t }) => (
                  <li
                    key={entry.uid}
                    className="border-b border-line last:border-0"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-sm py-3 text-left hover:bg-raised"
                      onClick={() => player.jumpTo(entry.uid)}
                    >
                      <LibraryCover
                        hash={t.artwork}
                        seed={t.album}
                        className="h-10 w-[52px]"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          dir="auto"
                          title={t.title}
                          className="block truncate text-body font-medium"
                        >
                          {t.title}
                        </span>
                        <span
                          dir="auto"
                          className="block truncate text-caption text-ink-3"
                        >
                          {t.artist}
                        </span>
                      </span>
                      <span className="tabular text-caption text-ink-3">
                        {formatTime(t.durationMs)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-meta text-ink-3">
                Use Play next or Add to queue on any song.
              </p>
            )}
            <button
              type="button"
              onClick={() => select("queue")}
              className="mt-4 flex w-full items-center justify-end gap-2 text-meta text-ink-3 hover:text-ink"
            >
              View queue <ArrowUpRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
