import { useVirtualizer } from "@tanstack/react-virtual";
import { GripVertical, ListMusic, X } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useMemo, useRef } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { LibraryCover } from "@/components/ui/LibraryCover";
import { Button, IconButton } from "@/components/ui/Button";
import { useDragReorder } from "@/hooks/useDragReorder";
import { useLibrary } from "@/stores/library";
import { player, usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import type { QueueEntry, Track } from "@/types/domain";
import { cn } from "@/utils/cn";
import { formatLongDuration, formatTime, plural } from "@/utils/format";

const ROW = 56;

export function QueuePanel({ embedded = false }: { embedded?: boolean }) {
  const queue = usePlayer((s) => s.queue);
  const cursor = usePlayer((s) => s.cursor);
  const current = usePlayer((s) => s.current);
  const trackById = useLibrary((s) => s.trackById);
  const scrollRef = useRef<HTMLDivElement>(null);

  const upcoming = useMemo(
    () => (cursor === null ? queue : queue.slice(cursor + 1)),
    [queue, cursor],
  );
  const offset = cursor === null ? 0 : cursor + 1;
  const remainingMs = useMemo(
    () =>
      upcoming.reduce(
        (sum, e) => sum + (trackById.get(e.trackId)?.durationMs ?? 0),
        0,
      ),
    [upcoming, trackById],
  );

  const virtualizer = useVirtualizer({
    count: upcoming.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 8,
    getItemKey: (i) => upcoming[i]?.uid ?? i,
  });

  const onMove = useCallback(
    (from: number, to: number) => {
      const entry = upcoming[from];
      if (entry) player.moveInQueue(entry.uid, to + offset);
    },
    [offset, upcoming],
  );
  const { drag, handleProps } = useDragReorder({
    count: upcoming.length,
    rowHeight: ROW,
    scrollRef,
    onMove,
  });

  return (
    <motion.aside
      id="queue-panel"
      aria-label="Queue"
      data-track-drop="queue"
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0, transition: { duration: 0.14 } }}
      transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "flex h-full shrink-0 flex-col bg-base",
        embedded ? "w-full" : "w-[300px] border-l border-line",
      )}
    >
      <div
        className="flex h-[var(--titlebar-height)] shrink-0 items-center justify-between pr-2 pl-5"
        data-tauri-drag-region
      >
        <h2 className="font-display text-title font-normal tracking-[-0.01em]">
          Queue
        </h2>
        <div className="flex items-center gap-1">
          {upcoming.length > 0 && (
            <Button variant="ghost" size="sm" onClick={player.clearQueue}>
              Clear
            </Button>
          )}
          {!embedded && (
            <IconButton
              icon={X}
              label="Close queue"
              shortcut="Q"
              size="sm"
              onClick={() => useUi.setState({ queueOpen: false })}
            />
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {current && (
          <section aria-label="Now playing" className="mb-4">
            <p className="px-2 pt-2 pb-2 caps text-[10px] text-ink-4 uppercase">
              Now playing
            </p>
            <div className="flex items-center gap-3 rounded-lg bg-raised/70 p-2.5">
              <LibraryCover
                hash={current.artwork}
                seed={current.album}
                className="h-12 w-[62px] shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p
                  className="bidi truncate text-body font-semibold text-blue-soft"
                >
                  {current.title}
                </p>
                <p className="bidi truncate text-meta text-ink-3">
                  {current.artist}
                </p>
              </div>
            </div>
          </section>
        )}

        {upcoming.length === 0 ? (
          <EmptyState
            icon={ListMusic}
            title="Nothing up next"
            description="Use “Play next” or “Add to queue” on any song to line it up here."
            className="py-10"
          />
        ) : (
          <section aria-label="Up next">
            <div className="flex items-baseline justify-between px-2 pb-2">
              <p className="caps text-[10px] text-ink-4 uppercase">Up next</p>
              <p className="text-caption text-ink-4">
                {plural(upcoming.length, "song")} ·{" "}
                {formatLongDuration(remainingMs)}
              </p>
            </div>
            <ul
              className="relative"
              style={{ height: virtualizer.getTotalSize() }}
              role="list"
            >
              {virtualizer.getVirtualItems().map((item) => {
                const entry = upcoming[item.index]!;
                const isDragged = drag?.from === item.index;
                let shift = 0;
                if (drag && !isDragged) {
                  if (drag.from < item.index && item.index <= drag.to)
                    shift = -ROW;
                  else if (drag.to <= item.index && item.index < drag.from)
                    shift = ROW;
                }
                return (
                  <li
                    key={item.key}
                    className={cn(
                      "absolute top-0 left-0 w-full",
                      drag &&
                        !isDragged &&
                        "transition-transform duration-(--duration-standard)",
                    )}
                    style={{
                      height: ROW,
                      transform: `translateY(${item.start + (isDragged ? drag.offsetY : shift)}px)`,
                      zIndex: isDragged ? 5 : undefined,
                    }}
                  >
                    <QueueRow
                      entry={entry}
                      track={trackById.get(entry.trackId)}
                      index={item.index}
                      dragging={isDragged}
                      dragHandle={handleProps(item.index)}
                      onMoveBy={(delta) => {
                        const to = item.index + delta;
                        if (to >= 0 && to < upcoming.length)
                          onMove(item.index, to);
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </motion.aside>
  );
}

function QueueRow({
  entry,
  track,
  index,
  dragging,
  dragHandle,
  onMoveBy,
}: {
  entry: QueueEntry;
  track: Track | undefined;
  index: number;
  dragging: boolean;
  dragHandle: ReturnType<ReturnType<typeof useDragReorder>["handleProps"]>;
  onMoveBy: (delta: number) => void;
}) {
  const title = track?.title ?? "Unavailable track";
  return (
    <div
      className={cn(
        "group flex h-14 items-center gap-2 rounded-md pr-1 pl-0.5 transition-colors hover:bg-raised/70",
        dragging && "bg-raised shadow-popover",
        track?.missing && "opacity-45",
      )}
    >
      <div
        {...dragHandle}
        className="flex h-full w-6 shrink-0 cursor-grab items-center justify-center text-ink-4 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        aria-hidden
      >
        <GripVertical className="size-4" />
      </div>
      <button
        type="button"
        onClick={() => player.jumpTo(entry.uid)}
        onKeyDown={(e) => {
          if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            onMoveBy(e.key === "ArrowUp" ? -1 : 1);
          }
        }}
        aria-label={`Play ${title}, position ${index + 1} in queue. Alt plus arrow keys to move.`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left"
      >
        <LibraryCover
          hash={track?.artwork}
          seed={track?.album ?? title}
          className="h-10 w-[52px] shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span
            className="bidi block truncate text-body font-medium text-ink"
          >
            {title}
          </span>
          <span className="block truncate text-meta text-ink-3">
            {track?.artist ?? ""}
          </span>
        </span>
      </button>
      <span className="tabular shrink-0 text-caption text-ink-4">
        {track ? formatTime(track.durationMs) : ""}
      </span>
      <IconButton
        icon={X}
        label={`Remove ${title} from queue`}
        size="xs"
        noTooltip
        className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => player.removeFromQueue(entry.uid)}
      />
    </div>
  );
}
