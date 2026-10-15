import { Disc3, ListEnd, ListMusic, MoreHorizontal, Play, Shuffle } from "lucide-react";
import { useMemo } from "react";

import { Page } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/feedback/EmptyState";
import { VinylCover } from "@/components/ui/VinylCover";
import { Button, IconButton } from "@/components/ui/Button";
import { DropdownMenuButton } from "@/components/ui/Menu";
import { AlbumCard, CardGrid, Shelf } from "@/features/library/Cards";
import { CollectionHero, Dot } from "@/features/library/CollectionHero";
import { playFrom, TrackTable } from "@/features/library/TrackTable";
import { playlistSubmenu } from "@/features/library/trackMenu";
import { useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { player, usePlayer } from "@/stores/player";
import { formatLongDuration, joinMeta } from "@/utils/format";
import { useT } from "@/i18n";
import { compareAlbumOrder } from "@/utils/tracks";

export function AlbumPage({ id }: { id: number }) {
  const t = useT();
  const album = useLibrary((s) => s.albumById.get(id));
  const allTracks = useLibrary((s) => s.tracks);
  const albums = useLibrary((s) => s.albums);
  const loaded = useLibrary((s) => s.loaded);
  const isCurrent = usePlayer((s) => s.current?.albumId === id);
  const playing = usePlayer((s) => s.status === "playing");

  const tracks = useMemo(() => allTracks.filter((t) => t.albumId === id).sort(compareAlbumOrder), [allTracks, id]);
  const playable = tracks.filter((t) => !t.missing);
  const moreByArtist = useMemo(
    () => (album ? albums.filter((a) => a.artistId === album.artistId && a.id !== album.id) : []),
    [albums, album],
  );
  const genres = [...new Set(tracks.map((t) => t.genre).filter(Boolean))].slice(0, 2);

  if (!album) {
    return (
      <Page>
        {loaded && (
          <EmptyState icon={Disc3} title={t.album.notFound} description={t.album.notFoundHint}>
            <Button onClick={() => navigate({ name: "library", tab: "albums" })}>{t.album.browse}</Button>
          </EmptyState>
        )}
      </Page>
    );
  }

  const ids = playable.map((t) => t.id);
  return (
    <div className="pb-16">
      <CollectionHero
        accent={album.accent}
        overline={t.album.overline}
        title={album.title}
        art={<VinylCover fullBleed hash={album.artwork} seed={album.title} artist={album.artist} title={album.title} accent={album.accent} out={isCurrent} spinning={isCurrent && playing} style={{ height: "232px", width: "calc(232px * 1.3)" }} alt={t.album.coverAlt(album.title)} />}
        meta={
          <>
            <button type="button" onClick={() => navigate({ name: "artist", id: album.artistId })} className="bidi font-semibold text-ink hover:underline">
              {album.artist}
            </button>
            {album.year && (
              <>
                <Dot />
                <span>{album.year}</span>
              </>
            )}
            {genres.length > 0 && (
              <>
                <Dot />
                <span>{genres.join(", ")}</span>
              </>
            )}
            <Dot />
            <span>{joinMeta([t.count.songs(album.trackCount), formatLongDuration(album.durationMs)])}</span>
          </>
        }
        actions={
          <>
            <Button variant="primary" icon={Play} disabled={!ids.length} onClick={() => player.playTracks(ids)}>
              {t.common.play}
            </Button>
            <Button
              variant="secondary"
              icon={Shuffle}
              disabled={!ids.length}
              onClick={() => {
                if (!usePlayer.getState().shuffle) player.toggleShuffle();
                player.playTracks(ids, Math.floor(Math.random() * ids.length));
              }}
            >
              {t.common.shuffle}
            </Button>
            <DropdownMenuButton
              align="start"
              entries={() => [
                { type: "item", label: t.menu.playNext, icon: ListEnd, onSelect: () => player.playNext(ids) },
                { type: "item", label: t.menu.addToQueue, icon: ListMusic, onSelect: () => player.enqueue(ids) },
                { type: "separator" },
                playlistSubmenu(ids),
              ]}
            >
              <IconButton icon={MoreHorizontal} label={t.album.moreOptions} className="bg-raised/70" />
            </DropdownMenuButton>
          </>
        }
      />
      <div className="mx-auto w-full max-w-[1680px] px-8">
        <TrackTable
          label={t.album.tracksLabel(album.title)}
          variant="album"
          albumArtist={album.artist}
          tracks={tracks}
          onPlay={(i) => playFrom(tracks, i, player.playTracks)}
        />
        {moreByArtist.length > 0 && (
          <Shelf title={t.album.moreBy(album.artist)} onSeeAll={() => navigate({ name: "artist", id: album.artistId })}>
            <CardGrid singleRow>
              {moreByArtist.map((a) => (
                <AlbumCard key={a.id} album={a} subtitle={a.year ? String(a.year) : t.album.fallbackSubtitle} />
              ))}
            </CardGrid>
          </Shelf>
        )}
      </div>
    </div>
  );
}
