import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  Clock3,
  GripVertical,
  Heart,
  MoreHorizontal,
  Play,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { useTrackTransfer } from "@/hooks/useTrackTransfer";

import {
  useOffsetWithin,
  useScrollContainer,
} from "@/components/layout/ScrollContext";
import { LibraryCover } from "@/components/ui/LibraryCover";
import { ContextMenuArea, DropdownMenuButton } from "@/components/ui/Menu";
import { useDragReorder } from "@/hooks/useDragReorder";
import { setFavorite } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { usePlayer } from "@/stores/player";
import { toast } from "@/stores/toasts";
import { setPreference, useUi } from "@/stores/ui";
import type { Track } from "@/types/domain";
import { cn } from "@/utils/cn";
import { formatRelativeDate, formatTime } from "@/utils/format";
import type { SortDirection, TrackSortKey } from "@/utils/tracks";
import { buildTrackMenu } from "./trackMenu";

export type TrackTableVariant = "library" | "album" | "playlist";

const ROW_HEIGHT = 56;

// Narrow containers drop the "added" column (container query on the table root).
const GRID: Record<TrackTableVariant, string> = {
  library:
    "grid-cols-[44px_minmax(160px,4fr)_minmax(100px,3fr)_36px_56px_36px] @3xl:grid-cols-[44px_minmax(200px,4fr)_minmax(120px,3fr)_minmax(96px,1.2fr)_36px_64px_36px]",
  album: "grid-cols-[44px_minmax(160px,1fr)_36px_64px_36px]",
  playlist:
    "grid-cols-[28px_36px_minmax(160px,4fr)_minmax(100px,3fr)_36px_56px_36px] @3xl:grid-cols-[28px_36px_minmax(200px,4fr)_minmax(120px,3fr)_minmax(96px,1.2fr)_36px_64px_36px]",
};

interface TrackTableProps {
  tracks: Track[];
  variant?: TrackTableVariant;
  /** Play the list starting at the given index (missing files are skipped by the caller). */
  onPlay: (index: number) => void;
  sort?: { key: TrackSortKey; dir: SortDirection };
  onSort?: (key: TrackSortKey) => void;
  /** Playlist mode: reorder and removal, addressed by row index. */
  onMove?: (from: number, to: number) => void;
  onRemove?: (indexes: number[]) => void;
  /** Album mode shows the per-track artist only when it differs from this. */
  albumArtist?: string;
  label: string;
}

export function TrackTable({
  tracks,
  variant = "library",
  onPlay,
  sort,
  onSort,
  onMove,
  onRemove,
  albumArtist,
  label,
}: TrackTableProps) {
  const scrollRef = useScrollContainer();
  const listRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useOffsetWithin(listRef, scrollRef);
  const currentId = usePlayer((s) => s.current?.id ?? null);
  const status = usePlayer((s) => s.status);
  const transfer = useTrackTransfer();

  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [focusIndex, setFocusIndex] = useState(0);
  const anchor = useRef(0);

  // Selection is index-based; reset it when the list's contents change (not on reorder,
  // which keeps the same members — a cheap order-independent fingerprint detects that).
  const contentKey = useMemo(
    () => `${tracks.length}:${tracks.reduce((sum, t) => sum + t.id, 0)}`,
    [tracks],
  );
  useEffect(() => {
    setSelected(new Set());
    setFocusIndex((i) => Math.min(i, Math.max(0, tracks.length - 1)));
  }, [contentKey]);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
    getItemKey: (i) => `${tracks[i]?.id ?? i}-${i}`,
  });

  const { drag, handleProps } = useDragReorder({
    count: tracks.length,
    rowHeight: ROW_HEIGHT,
    scrollRef,
    onMove: (from, to) => onMove?.(from, to),
  });

  const selectionFor = useCallback(
    (index: number): number[] =>
      selected.has(index) ? [...selected].sort((a, b) => a - b) : [index],
    [selected],
  );

  const handleRowClick = useCallback((index: number, e: MouseEvent) => {
    setFocusIndex(index);
    if (e.shiftKey) {
      const [a, b] = [
        Math.min(anchor.current, index),
        Math.max(anchor.current, index),
      ];
      setSelected(new Set(Array.from({ length: b - a + 1 }, (_, k) => a + k)));
      return;
    }
    anchor.current = index;
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
    } else {
      setSelected(new Set([index]));
    }
  }, []);

  const playAt = useCallback(
    (index: number) => {
      const t = tracks[index];
      if (!t) return;
      if (t.missing) {
        toast({
          tone: "error",
          title: "File not found",
          description: `“${t.title}” is no longer at ${t.path}.`,
        });
        return;
      }
      onPlay(index);
    },
    [onPlay, tracks],
  );

  const menuFor = useCallback(
    (index: number) => {
      const indexes = selectionFor(index);
      return buildTrackMenu({
        tracks: indexes.map((i) => tracks[i]!).filter(Boolean),
        play: () => playAt(indexes[0]!),
        onRemoveFromPlaylist: onRemove ? () => onRemove(indexes) : undefined,
        hideGoToAlbum: variant === "album",
      });
    },
    [onRemove, playAt, selectionFor, tracks, variant],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!tracks.length) return;
    const move = (to: number) => {
      const i = Math.max(0, Math.min(tracks.length - 1, to));
      setFocusIndex(i);
      if (e.shiftKey) {
        const [a, b] = [
          Math.min(anchor.current, i),
          Math.max(anchor.current, i),
        ];
        setSelected(
          new Set(Array.from({ length: b - a + 1 }, (_, k) => a + k)),
        );
      } else {
        anchor.current = i;
        setSelected(new Set([i]));
      }
      virtualizer.scrollToIndex(i, { align: "auto" });
    };
    if (e.altKey && onMove && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const to = focusIndex + (e.key === "ArrowUp" ? -1 : 1);
      if (to >= 0 && to < tracks.length) {
        onMove(focusIndex, to);
        setFocusIndex(to);
        setSelected(new Set([to]));
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(focusIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(focusIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(tracks.length - 1);
        break;
      case "PageDown":
        e.preventDefault();
        move(focusIndex + 10);
        break;
      case "PageUp":
        e.preventDefault();
        move(focusIndex - 10);
        break;
      case "Enter":
        e.preventDefault();
        playAt(focusIndex);
        break;
      case "a":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          setSelected(new Set(tracks.map((_, i) => i)));
        }
        break;
      case "Delete":
        if (onRemove) {
          e.preventDefault();
          onRemove(selectionFor(focusIndex));
        }
        break;
      case "ContextMenu":
      case "F10":
        if (e.key === "ContextMenu" || e.shiftKey) {
          e.preventDefault();
          document.getElementById(`${label}-more-${focusIndex}`)?.click();
        }
        break;
    }
  };

  const rowId = (i: number) => `${label.replace(/\W+/g, "-")}-row-${i}`;
  const items = virtualizer.getVirtualItems();

  return (
    <div className="@container relative">
      <HeaderRow variant={variant} sort={sort} onSort={onSort} />
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        aria-multiselectable
        aria-activedescendant={tracks.length ? rowId(focusIndex) : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="group/list relative rounded-md focus-visible:outline-none"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {items.map((item) => {
          const index = item.index;
          const track = tracks[index]!;
          const isDragged = drag?.from === index;
          let shift = 0;
          if (drag && !isDragged) {
            if (drag.from < index && index <= drag.to) shift = -ROW_HEIGHT;
            else if (drag.to <= index && index < drag.from) shift = ROW_HEIGHT;
          }
          return (
            <div
              key={item.key}
              className={cn(
                "absolute top-0 left-0 w-full",
                drag &&
                  !isDragged &&
                  "transition-transform duration-(--duration-standard) ease-(--ease-out)",
              )}
              style={{
                height: ROW_HEIGHT,
                transform: `translateY(${item.start - scrollMargin + (isDragged ? drag.offsetY : shift)}px)`,
                zIndex: isDragged ? 5 : undefined,
              }}
            >
              <TrackRow
                id={rowId(index)}
                track={track}
                index={index}
                variant={variant}
                playing={track.id === currentId}
                paused={status !== "playing"}
                selected={selected.has(index)}
                focused={focusIndex === index}
                dragging={isDragged}
                showArtist={
                  variant !== "album" ||
                  (!!albumArtist && track.artist !== albumArtist)
                }
                menuId={`${label}-more-${index}`}
                onClick={(index, e) => {
                  if (!transfer.consumeClick()) handleRowClick(index, e);
                }}
                onPointerDown={(e) =>
                  transfer.start(
                    e,
                    selectionFor(index)
                      .map((i) => tracks[i]!)
                      .filter((t) => t && !t.missing)
                      .map((t) => t.id),
                  )
                }
                onPlay={playAt}
                menu={menuFor}
                dragHandle={
                  variant === "playlist" ? handleProps(index) : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeaderRow({
  variant,
  sort,
  onSort,
}: {
  variant: TrackTableVariant;
  sort?: TrackTableProps["sort"];
  onSort?: (k: TrackSortKey) => void;
}) {
  const cell = (
    key: TrackSortKey | null,
    text: string,
    className?: string,
    icon?: boolean,
  ) => {
    const active = key && sort?.key === key;
    const content = (
      <>
        {icon ? <Clock3 className="size-3.5" aria-label={text} /> : text}
        {active &&
          (sort?.dir === "asc" ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          ))}
      </>
    );
    if (!key || !onSort)
      return (
        <div className={cn("flex items-center gap-1", className)}>
          {content}
        </div>
      );
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        aria-label={`Sort by ${text}`}
        aria-pressed={!!active}
        className={cn(
          "flex items-center gap-1 rounded-xs hover:text-ink",
          active && "text-ink-2",
          className,
        )}
      >
        {content}
      </button>
    );
  };
  return (
    <div
      className={cn(
        "sticky top-[var(--titlebar-height)] z-10 -mx-3 mb-1 grid h-9 items-center gap-3 border-b border-line bg-obsidian/92 px-3 text-overline font-semibold tracking-[0.09em] text-ink-4 uppercase backdrop-blur-md",
        GRID[variant],
      )}
      role="presentation"
    >
      {variant === "playlist" && <div />}
      <div className="text-center">#</div>
      {cell("title", "Title")}
      {variant !== "album" && cell("album", "Album")}
      {variant !== "album" &&
        cell(
          "addedAt",
          variant === "playlist" ? "Added" : "Date added",
          "hidden @3xl:flex",
        )}
      <div />
      {cell("durationMs", "Duration", "justify-end", true)}
      <div />
    </div>
  );
}

interface RowProps {
  id: string;
  track: Track;
  index: number;
  variant: TrackTableVariant;
  playing: boolean;
  paused: boolean;
  selected: boolean;
  focused: boolean;
  dragging: boolean;
  showArtist: boolean;
  menuId: string;
  onClick: (index: number, e: MouseEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPlay: (index: number) => void;
  menu: (index: number) => ReturnType<typeof buildTrackMenu>;
  dragHandle?: ReturnType<ReturnType<typeof useDragReorder>["handleProps"]>;
}

const TrackRow = memo(function TrackRow({
  id,
  track,
  index,
  variant,
  playing,
  paused,
  selected,
  focused,
  dragging,
  showArtist,
  menuId,
  onClick,
  onPointerDown,
  onPlay,
  menu,
  dragHandle,
}: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const number =
    variant === "album" ? (track.trackNumber ?? index + 1) : index + 1;

  return (
    <ContextMenuArea entries={() => menu(index)} onOpenChange={setMenuOpen}>
      <div
        id={id}
        role="option"
        aria-selected={selected}
        aria-label={`${track.title} by ${track.artist}${track.missing ? ", file missing" : ""}`}
        onClick={(e) => onClick(index, e)}
        onPointerDown={onPointerDown}
        onDoubleClick={() => onPlay(index)}
        className={cn(
          "group -mx-3 grid h-14 items-center gap-3 rounded-md px-3 text-body transition-colors duration-(--duration-micro)",
          GRID[variant],
          selected
            ? "bg-blue/14"
            : menuOpen
              ? "bg-raised"
              : "hover:bg-raised/70",
          // Keyboard cursor: only visible while the list itself has keyboard focus.
          focused &&
            "group-focus-visible/list:ring-1 group-focus-visible/list:ring-blue-soft/60 group-focus-visible/list:ring-inset",
          dragging && "bg-raised shadow-popover",
          track.missing && "opacity-45",
        )}
      >
        {dragHandle && (
          <div
            {...dragHandle}
            className="flex h-full cursor-grab items-center justify-center text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
            aria-hidden
          >
            <GripVertical className="size-4" />
          </div>
        )}

        <div className="relative flex items-center justify-center">
          <span
            className={cn(
              "tabular text-meta text-ink-3 group-hover:invisible",
              playing && "invisible",
            )}
          >
            {number}
          </span>
          {playing && (
            <AudioLines
              className={cn(
                "absolute size-4 text-blue-soft group-hover:invisible",
                paused && "opacity-60",
              )}
              aria-label={paused ? "Paused" : "Now playing"}
            />
          )}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onPlay(index);
            }}
            aria-label={`Play ${track.title}`}
            className="invisible absolute inset-0 m-auto flex size-8 items-center justify-center rounded-full text-ink group-hover:visible hover:bg-lifted"
          >
            <Play className="size-4 fill-current" aria-hidden />
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          {variant !== "album" && (
            <LibraryCover
              hash={track.artwork}
              seed={track.album}
              className="h-10 w-[52px] shrink-0"
            />
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "bidi truncate font-medium",
                playing ? "text-blue-soft" : "text-ink",
              )}
            >
              {track.title}
            </p>
            {(showArtist || track.missing) && (
              <p className="truncate text-meta text-ink-3">
                {track.missing ? (
                  <span className="text-warning">File missing</span>
                ) : (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="bidi hover:text-ink hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate({ name: "artist", id: track.artistId });
                    }}
                  >
                    {track.artist}
                  </button>
                )}
              </p>
            )}
          </div>
        </div>

        {variant !== "album" && (
          <p className="truncate text-meta text-ink-3">
            <button
              type="button"
              tabIndex={-1}
              className="bidi max-w-full truncate hover:text-ink hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                navigate({ name: "album", id: track.albumId });
              }}
            >
              {track.album}
            </button>
          </p>
        )}
        {variant !== "album" && (
          <p className="hidden truncate text-meta text-ink-3 @3xl:block">
            {formatRelativeDate(track.addedAt)}
          </p>
        )}

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            void setFavorite([track.id], !track.favorite);
          }}
          aria-label={
            track.favorite
              ? `Remove ${track.title} from favorites`
              : `Add ${track.title} to favorites`
          }
          aria-pressed={track.favorite}
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition-[opacity,color] hover:bg-lifted",
            track.favorite
              ? "text-violet-soft"
              : "text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink",
          )}
        >
          <Heart
            className={cn("size-4", track.favorite && "fill-current")}
            aria-hidden
          />
        </button>

        <span className="tabular text-right text-meta text-ink-3">
          {track.durationMs ? formatTime(track.durationMs) : "–"}
        </span>

        <DropdownMenuButton
          entries={() => menu(index)}
          onOpenChange={setMenuOpen}
        >
          <button
            id={menuId}
            type="button"
            tabIndex={-1}
            aria-label={`More options for ${track.title}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-lifted hover:text-ink",
              menuOpen
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        </DropdownMenuButton>
      </div>
    </ContextMenuArea>
  );
});

/** Plays a list, skipping missing files, starting at the clicked row. */
export function playFrom(
  tracks: Track[],
  index: number,
  play: (ids: number[], start: number) => void,
) {
  // Count playable rows before the clicked one so duplicate tracks start at the right row.
  const start = tracks.slice(0, index).filter((t) => !t.missing).length;
  play(
    tracks.filter((t) => !t.missing).map((t) => t.id),
    start,
  );
}

export function useSortState(
  initial: TrackSortKey = "default",
  persistent = false,
) {
  const saved = useUi((s) => s.prefs.songSort);
  const [localSort, setSort] = useState<{
    key: TrackSortKey;
    dir: SortDirection;
  }>({ key: initial, dir: initial === "addedAt" ? "desc" : "asc" });
  const parts = saved?.split(":");
  const sort =
    persistent &&
    parts &&
    [
      "default",
      "title",
      "artist",
      "album",
      "addedAt",
      "durationMs",
      "playCount",
    ].includes(parts[0]!) &&
    ["asc", "desc"].includes(parts[1]!)
      ? { key: parts[0] as TrackSortKey, dir: parts[1] as SortDirection }
      : localSort;
  const toggle = useCallback(
    (key: TrackSortKey) => {
      const next: typeof sort =
        sort.key !== key
          ? {
              key,
              dir: key === "addedAt" || key === "playCount" ? "desc" : "asc",
            }
          : sort.dir === "asc"
            ? { key, dir: "desc" }
            : { key: "default", dir: "asc" };
      setSort(next);
      if (persistent) void setPreference("songSort", next.key + ":" + next.dir);
    },
    [sort.key, sort.dir, persistent],
  );
  return useMemo(() => ({ sort, toggle }), [sort, toggle]);
}
