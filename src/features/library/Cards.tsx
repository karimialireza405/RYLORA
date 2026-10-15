import {
  ChevronRight,
  ListEnd,
  ListMusic,
  Mic2,
  Pin,
  Play,
  Play as PlayIcon,
} from "lucide-react";
import { Children, memo, type ReactNode } from "react";

import { Artwork, Mosaic } from "@/components/ui/Artwork";
import { LibraryCover } from "@/components/ui/LibraryCover";
import { pinnedAlbumIds, toggleAlbumPin } from "./pins";
import { useUi } from "@/stores/ui";
import { ContextMenuArea, type MenuEntry } from "@/components/ui/Menu";
import { backend } from "@/services/backend";
import { useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { player } from "@/stores/player";
import type { Album, Artist, Playlist, Track } from "@/types/domain";
import { cn } from "@/utils/cn";
import { formatLongDuration, joinMeta, plural } from "@/utils/format";
import { compareAlbumOrder } from "@/utils/tracks";
import { playlistSubmenu } from "./trackMenu";

export function albumTracks(albumId: number): Track[] {
  return useLibrary
    .getState()
    .tracks.filter((t) => t.albumId === albumId && !t.missing)
    .sort(compareAlbumOrder);
}

export function albumMenu(album: Album): MenuEntry[] {
  const ids = () => albumTracks(album.id).map((t) => t.id);
  return [
    {
      type: "item",
      label: "Play",
      icon: PlayIcon,
      onSelect: () => player.playTracks(ids()),
    },
    {
      type: "item",
      label: "Play next",
      icon: ListEnd,
      onSelect: () => player.playNext(ids()),
    },
    {
      type: "item",
      label: "Add to queue",
      icon: ListMusic,
      onSelect: () => player.enqueue(ids()),
    },
    { type: "separator" },
    playlistSubmenu(ids()),
    {
      type: "item",
      label: pinnedAlbumIds(useUi.getState().prefs.pinnedAlbums).includes(
        album.id,
      )
        ? "Unpin album"
        : "Pin album",
      icon: Pin,
      onSelect: () => toggleAlbumPin(album.id),
    },
    { type: "separator" },
    {
      type: "item",
      label: "Go to artist",
      icon: Mic2,
      onSelect: () => navigate({ name: "artist", id: album.artistId }),
    },
  ];
}

/** Hover-revealed round play button that sits on artwork. */
function ArtPlayButton({
  label,
  onPlay,
  className,
}: {
  label: string;
  onPlay: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onPlay();
      }}
      className={cn(
        "absolute right-[24%] bottom-2.5 z-10 flex size-10 items-center justify-center rounded-full bg-blue-soft text-obsidian shadow-[0_8px_20px_-6px_rgb(0_0_0/0.7)]",
        "translate-y-2 opacity-0 transition-[opacity,transform,background-color] duration-(--duration-standard) ease-(--ease-out)",
        "group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 hover:scale-105 hover:bg-white",
        className,
      )}
    >
      <Play
        className="size-[18px] translate-x-[1px] fill-current"
        strokeWidth={0}
        aria-hidden
      />
    </button>
  );
}

export const AlbumCard = memo(function AlbumCard({
  album,
  subtitle,
}: {
  album: Album;
  subtitle?: string;
}) {
  return (
    <ContextMenuArea entries={() => albumMenu(album)}>
      <div className="group relative min-w-0 rounded-sm">
        <div className="relative">
          <LibraryCover
            hash={album.artwork}
            seed={album.title}
            accent={album.accent}
            large
            className="w-full"
          />
          <ArtPlayButton
            label={`Play ${album.title}`}
            onPlay={() =>
              player.playTracks(albumTracks(album.id).map((t) => t.id))
            }
          />
        </div>
        <button
          type="button"
          onClick={() => navigate({ name: "album", id: album.id })}
          className="mt-3 block w-full rounded-xs text-left after:absolute after:inset-0 after:content-['']"
          aria-label={`${album.title} by ${album.artist}`}
          title={joinMeta([album.title, album.artist])}
        >
          <span
            className="bidi block truncate text-body font-semibold text-ink"
          >
            {album.title}
          </span>
          <span className="mt-0.5 block truncate text-meta text-ink-3">
            {subtitle ?? joinMeta([album.artist, album.year])}
          </span>
        </button>
      </div>
    </ContextMenuArea>
  );
});

export const ArtistCard = memo(function ArtistCard({
  artist,
}: {
  artist: Artist;
}) {
  return (
    <div className="group relative min-w-0 text-center">
      <div className="relative mx-auto">
        <Artwork
          hash={artist.artwork}
          seed={artist.name}
          rounded="full"
          className="aspect-square w-full shadow-art"
        />
      </div>
      <button
        type="button"
        onClick={() => navigate({ name: "artist", id: artist.id })}
        className="mt-3 block w-full rounded-xs after:absolute after:inset-0 after:content-['']"
      >
        <span
          className="bidi block truncate text-body font-semibold text-ink"
        >
          {artist.name}
        </span>
        <span className="mt-0.5 block truncate text-meta text-ink-3">
          {plural(artist.albumCount, "album")} ·{" "}
          {plural(artist.trackCount, "song")}
        </span>
      </button>
    </div>
  );
});

export const PlaylistCard = memo(function PlaylistCard({
  playlist,
}: {
  playlist: Playlist;
}) {
  return (
    <div className="group relative min-w-0 rounded-sm">
      <div className="relative">
        <LibraryCover
          hash={playlist.artworks[0]}
          seed={playlist.name}
          large
          inset={
            <Mosaic
              hashes={playlist.artworks}
              seed={playlist.name}
              size="lg"
              className="h-full w-full rounded-none"
            />
          }
          className="w-full"
        />
        {playlist.trackCount > 0 && (
          <ArtPlayButton
            label={`Play ${playlist.name}`}
            onPlay={async () => {
              const entries = await backend().playlists.entries(playlist.id);
              const map = useLibrary.getState().trackById;
              player.playTracks(
                entries
                  .map((e) => e.trackId)
                  .filter((id) => map.get(id) && !map.get(id)!.missing),
              );
            }}
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => navigate({ name: "playlist", id: playlist.id })}
        className="mt-3 block w-full rounded-xs text-left after:absolute after:inset-0 after:content-['']"
      >
        <span
          className="bidi block truncate text-body font-semibold text-ink"
        >
          {playlist.name}
        </span>
        <span className="mt-0.5 block truncate text-meta text-ink-3">
          {plural(playlist.trackCount, "song")}
          {playlist.durationMs > 0 &&
            ` · ${formatLongDuration(playlist.durationMs)}`}
        </span>
      </button>
    </div>
  );
});

/** Responsive card grid. `singleRow` hides whatever doesn't fit on one line. */
export function CardGrid({
  children,
  singleRow,
  min = 184,
  className,
}: {
  children: ReactNode;
  singleRow?: boolean;
  min?: number;
  className?: string;
}) {
  if (singleRow)
    return (
      <div
        className={cn(
          "flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none]",
          className,
        )}
      >
        {Children.map(children, (child) => (
          <div className="min-w-0 shrink-0" style={{ width: min }}>
            {child}
          </div>
        ))}
      </div>
    );
  return (
    <div
      className={cn("grid gap-x-4 gap-y-6", className)}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

export function Shelf({
  title,
  onSeeAll,
  children,
  className,
}: {
  title: string;
  onSeeAll?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-7", className)} aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-[19px] font-bold tracking-[-0.025em] text-ink">
          {title}
        </h2>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex items-center gap-0.5 rounded-xs text-meta font-semibold text-ink-3 hover:text-ink"
          >
            See all
            <ChevronRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
