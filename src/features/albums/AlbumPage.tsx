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
import { albumSides } from "./sides";

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
  const sides = useMemo(() => albumSides(tracks), [tracks]);
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
        art={<VinylCover fullBleed hash={album.artwork} seed={album.title} artist={album.artist} title={album.title} accent={album.accent} out spinning={isCurrent && playing} style={{ height: "clamp(220px, 30vh, 300px)", width: "calc(clamp(220px, 30vh, 300px) * 1.3)" }} alt={t.album.coverAlt(album.title)} />}
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
        {sides.map((side) => (
          <section key={side.label} aria-label={side.kind === "disc" ? t.album.disc(side.label) : t.album.side(side.label)} className="mb-8">
            {sides.length > 1 && <SideHeading kind={side.kind} label={side.label} durationMs={side.durationMs} count={side.tracks.length} />}
            <TrackTable
              label={t.album.tracksLabel(album.title)}
              variant="album"
              albumArtist={album.artist}
              tracks={side.tracks}
              onPlay={(i) => playFrom(tracks, side.offset + i, player.playTracks)}
            />
          </section>
        ))}
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

/** "Side A" with a small half-disc, like the label on a record's run-out. */
function SideHeading({ kind, label, durationMs, count }: { kind: "side" | "disc"; label: string; durationMs: number; count: number }) {
  const t = useT();
  return (
    <div className="mb-2 flex items-center gap-3 border-b border-line px-2 pb-2.5">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-full font-display text-[15px] text-obsidian shadow-[0_0_12px_color-mix(in_srgb,var(--color-accent-soft)_45%,transparent)]"
        style={{ background: "radial-gradient(circle, var(--color-accent-soft) 0 52%, #18191d 54% 100%)" }}
      >
        {label}
      </span>
      <h2 className="text-lead text-ink">{kind === "disc" ? t.album.disc(label) : t.album.side(label)}</h2>
      <span className="text-meta text-ink-3">{joinMeta([t.count.songs(count), formatLongDuration(durationMs)])}</span>
    </div>
  );
}
