import { Mic2, Play, Shuffle } from "lucide-react";
import { useMemo } from "react";

import { Page } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Artwork } from "@/components/ui/Artwork";
import { Button } from "@/components/ui/Button";
import { AlbumCard, CardGrid, Shelf } from "@/features/library/Cards";
import { CollectionHero, Dot } from "@/features/library/CollectionHero";
import { playFrom, TrackTable } from "@/features/library/TrackTable";
import { useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { player, usePlayer } from "@/stores/player";
import { joinMeta, plural } from "@/utils/format";
import { compareAlbumOrder } from "@/utils/tracks";

export function ArtistPage({ id }: { id: number }) {
  const artist = useLibrary((s) => s.artistById.get(id));
  const allTracks = useLibrary((s) => s.tracks);
  const albums = useLibrary((s) => s.albums);
  const playCounts = useLibrary((s) => s.playCounts);
  const loaded = useLibrary((s) => s.loaded);

  const artistAlbums = useMemo(
    () => albums.filter((a) => a.artistId === id).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    [albums, id],
  );
  const tracks = useMemo(() => {
    const albumOrder = new Map(artistAlbums.map((a, i) => [a.id, i]));
    return allTracks
      .filter((t) => t.artistId === id || albumOrder.has(t.albumId))
      .sort((a, b) => (albumOrder.get(a.albumId) ?? 99) - (albumOrder.get(b.albumId) ?? 99) || compareAlbumOrder(a, b));
  }, [allTracks, artistAlbums, id]);
  // Compilations and collaborations credited to someone else at album level.
  const appearsOn = useMemo(() => {
    const ids = new Set(allTracks.filter((t) => t.artistId === id).map((t) => t.albumId));
    return albums.filter((a) => ids.has(a.id) && a.artistId !== id);
  }, [albums, allTracks, id]);
  // "Most played" only appears once there is real listening history for this artist.
  const mostPlayed = useMemo(
    () =>
      tracks
        .filter((t) => (playCounts[t.id] ?? 0) > 0 && !t.missing)
        .sort((a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0))
        .slice(0, 5),
    [tracks, playCounts],
  );
  const playable = tracks.filter((t) => !t.missing).map((t) => t.id);

  if (!artist) {
    return (
      <Page>
        {loaded && (
          <EmptyState icon={Mic2} title="Artist not found" description="They may have been removed from your library.">
            <Button onClick={() => navigate({ name: "library", tab: "artists" })}>Browse artists</Button>
          </EmptyState>
        )}
      </Page>
    );
  }

  return (
    <div className="pb-16">
      <CollectionHero
        accent={artist.accent}
        overline="Artist"
        title={artist.name}
        art={<Artwork hash={artist.artwork} seed={artist.name} size="lg" rounded="full" className="size-[216px] shadow-art" />}
        meta={
          <>
            <span>{plural(artist.albumCount, "album")}</span>
            <Dot />
            <span>{plural(artist.trackCount, "song")}</span>
          </>
        }
        actions={
          <>
            <Button variant="primary" icon={Play} disabled={!playable.length} onClick={() => player.playTracks(playable)}>
              Play
            </Button>
            <Button
              variant="secondary"
              icon={Shuffle}
              disabled={!playable.length}
              onClick={() => {
                if (!usePlayer.getState().shuffle) player.toggleShuffle();
                player.playTracks(playable, Math.floor(Math.random() * playable.length));
              }}
            >
              Shuffle
            </Button>
          </>
        }
      />
      <div className="mx-auto w-full max-w-[1680px] px-8">
        {mostPlayed.length > 0 && (
          <section className="mb-10" aria-label="Most played">
            <h2 className="mb-3 font-display text-title font-normal tracking-[-0.01em]">Most played</h2>
            <TrackTable label="Most played" tracks={mostPlayed} onPlay={(i) => playFrom(mostPlayed, i, player.playTracks)} />
          </section>
        )}
        {artistAlbums.length > 0 && (
          <Shelf title="Albums" className="mt-0 mb-12">
            <CardGrid>
              {artistAlbums.map((a) => (
                <AlbumCard key={a.id} album={a} subtitle={joinMeta([a.year, plural(a.trackCount, "song")])} />
              ))}
            </CardGrid>
          </Shelf>
        )}
        <h2 className="mb-3 font-display text-title font-normal tracking-[-0.01em]">All songs</h2>
        <TrackTable label={`${artist.name} songs`} tracks={tracks} onPlay={(i) => playFrom(tracks, i, player.playTracks)} />
        {appearsOn.length > 0 && (
          <Shelf title="Appears on">
            <CardGrid singleRow>
              {appearsOn.map((a) => (
                <AlbumCard key={a.id} album={a} />
              ))}
            </CardGrid>
          </Shelf>
        )}
      </div>
    </div>
  );
}
