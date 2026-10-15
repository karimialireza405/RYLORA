import { Play, Search as SearchIcon, SearchX } from "lucide-react";
import { useDeferredValue, useEffect, useMemo } from "react";

import { Page } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Artwork } from "@/components/ui/Artwork";
import { VinylCover } from "@/components/ui/VinylCover";
import { albumTracks, AlbumCard, ArtistCard, CardGrid, PlaylistCard, Shelf } from "@/features/library/Cards";
import { playFrom, TrackTable } from "@/features/library/TrackTable";
import { useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { player } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { searchLibrary, type SearchResults } from "@/utils/tracks";
import { joinMeta } from "@/utils/format";

export function SearchPage() {
  const query = useUi((s) => s.searchQuery);
  const deferred = useDeferredValue(query);
  const tracks = useLibrary((s) => s.tracks);
  const albums = useLibrary((s) => s.albums);
  const artists = useLibrary((s) => s.artists);
  const playlists = useLibrary((s) => s.playlists);

  useEffect(() => {
    window.dispatchEvent(new Event("rylora:focus-search"));
  }, []);

  const results = useMemo(() => searchLibrary(deferred, { tracks, albums, artists, playlists }), [deferred, tracks, albums, artists, playlists]);
  const hasQuery = deferred.trim().length > 0;
  const nothing = hasQuery && !results.tracks.length && !results.albums.length && !results.artists.length && !results.playlists.length;
  const topTracks = results.tracks.slice(0, 5);

  return (
    <Page>
      <h1 className="sr-only">Search</h1>
      {!hasQuery ? (
        <EmptyState
          icon={SearchIcon}
          title="Search your library"
          description={
            <>
              Find songs, albums, artists and playlists instantly. Press <kbd className="rounded-xs px-1 ring-1 ring-line-strong">Ctrl K</kbd> from
              anywhere.
            </>
          }
          className="pt-28"
        />
      ) : nothing ? (
        <EmptyState icon={SearchX} title={`No results for “${deferred.trim()}”`} description="Check the spelling, or try fewer words." className="pt-28" />
      ) : (
        <div aria-live="polite">
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(320px,0.9fr)_1.6fr]">
            {results.top && (
              <section aria-label="Top result">
                <h2 className="mb-4 font-display text-title font-normal tracking-[-0.01em]">Top result</h2>
                <TopResult top={results.top} />
              </section>
            )}
            {topTracks.length > 0 && (
              <section aria-label="Songs" className="min-w-0">
                <h2 className="mb-4 font-display text-title font-normal tracking-[-0.01em]">Songs</h2>
                <TrackTable label="Song results" tracks={topTracks} onPlay={(i) => playFrom(results.tracks, i, player.playTracks)} />
              </section>
            )}
          </div>
          {results.artists.length > 0 && (
            <Shelf title="Artists">
              <CardGrid singleRow min={150}>
                {results.artists.map((a) => (
                  <ArtistCard key={a.id} artist={a} />
                ))}
              </CardGrid>
            </Shelf>
          )}
          {results.albums.length > 0 && (
            <Shelf title="Albums">
              <CardGrid singleRow>
                {results.albums.map((a) => (
                  <AlbumCard key={a.id} album={a} />
                ))}
              </CardGrid>
            </Shelf>
          )}
          {results.playlists.length > 0 && (
            <Shelf title="Playlists">
              <CardGrid singleRow>
                {results.playlists.map((p) => (
                  <PlaylistCard key={p.id} playlist={p} />
                ))}
              </CardGrid>
            </Shelf>
          )}
          {results.tracks.length > topTracks.length && (
            <section className="mt-11" aria-label="All matching songs">
              <h2 className="mb-4 font-display text-title font-normal tracking-[-0.01em]">All matching songs</h2>
              <TrackTable label="All song results" tracks={results.tracks} onPlay={(i) => playFrom(results.tracks, i, player.playTracks)} />
            </section>
          )}
        </div>
      )}
    </Page>
  );
}

function TopResult({ top }: { top: NonNullable<SearchResults["top"]> }) {
  const { title, subtitle, hash, seed, open, play } = (() => {
    switch (top.kind) {
      case "artist":
        return {
          title: top.item.name,
          subtitle: "Artist",
          hash: top.item.artwork,
          seed: top.item.name,
          open: () => navigate({ name: "artist", id: top.item.id }),
          play: () => {
            const ids = useLibrary.getState().tracks.filter((t) => t.artistId === top.item.id && !t.missing).map((t) => t.id);
            player.playTracks(ids);
          },
        };
      case "album":
        return {
          title: top.item.title,
          subtitle: joinMeta(["Album", top.item.artist]),
          hash: top.item.artwork,
          seed: top.item.title,
          open: () => navigate({ name: "album", id: top.item.id }),
          play: () => player.playTracks(albumTracks(top.item.id).map((t) => t.id)),
        };
      case "track":
        return {
          title: top.item.title,
          subtitle: joinMeta(["Song", top.item.artist]),
          hash: top.item.artwork,
          seed: top.item.album,
          open: () => navigate({ name: "album", id: top.item.albumId }),
          play: () => player.playTracks([top.item.id]),
        };
    }
  })();
  return (
    <div className="group relative rounded-xl bg-deep p-6 ring-1 ring-line ring-inset transition-colors hover:bg-raised">
      {top.kind === "artist" ? (
        <Artwork hash={hash} seed={seed} size="lg" rounded="full" className="size-28 shadow-art" />
      ) : (
        <VinylCover
          fullBleed
          hash={hash}
          seed={seed}
          artist={top.item.artist}
          title={top.kind === "track" ? top.item.album : top.item.title}
          accent={top.item.accent}
          style={{ height: 112, width: 146 }}
        />
      )}
      <button type="button" onClick={open} className="mt-5 block w-full text-left after:absolute after:inset-0 after:content-['']">
        <span className="bidi glow-room block truncate font-display text-heading font-light glow tracking-[-0.01em]">
          {title}
        </span>
        <span className="mt-1 block text-meta text-ink-3">{subtitle}</span>
      </button>
      <button
        type="button"
        onClick={play}
        aria-label={`Play ${title}`}
        className="absolute right-6 bottom-6 z-10 flex size-12 items-center justify-center rounded-full bg-ink text-obsidian opacity-0 shadow-[0_8px_20px_-6px_rgb(0_0_0/0.7)] transition-[opacity,transform] group-focus-within:opacity-100 group-hover:opacity-100 hover:scale-105"
      >
        <Play className="size-5 translate-x-[1px] fill-current" strokeWidth={0} aria-hidden />
      </button>
    </div>
  );
}
