import { ArrowRight, FileAudio, FolderPlus, Pause, Play } from "lucide-react";
import { useMemo } from "react";
import { Page } from "@/components/layout/AppShell";
import { VinylCover } from "@/components/ui/VinylCover";
import { Button } from "@/components/ui/Button";
import { ContextMenuArea } from "@/components/ui/Menu";
import { CardGridSkeleton } from "@/components/feedback/EmptyState";
import { addFilesInteractive, addFolderInteractive } from "@/features/library/actions";
import { AlbumCard, albumTracks } from "@/features/library/Cards";
import { buildTrackMenu } from "@/features/library/trackMenu";
import { useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { player, usePlayer } from "@/stores/player";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { Track } from "@/types/domain";
import { plural } from "@/utils/format";
import { SUPPORTED_FORMAT_LABEL } from "@/utils/formats";

/** A focused listening entry point: one continuation and one shelf of other records. */
export function HomePage() {
  const loaded = useLibrary((s) => s.loaded);
  const tracks = useLibrary((s) => s.tracks);
  const albums = useLibrary((s) => s.albums);
  const history = useLibrary((s) => s.recentPlays);
  const trackById = useLibrary((s) => s.trackById);
  const current = usePlayer((s) => s.current);
  const scanning = useLibrary((s) => s.scanning);
  const playable = useMemo(() => tracks.filter(t => !t.missing), [tracks]);
  const continuation = useMemo(() => {
    const restored = current && trackById.get(current.id);
    if (restored && !restored.missing) return restored;
    for (const entry of history) {
      const track = trackById.get(entry.trackId);
      if (track && !track.missing) return track;
    }
    return [...playable].sort((a, b) => b.addedAt - a.addedAt)[0];
  }, [current?.id, history, trackById, playable]);
  const records = useMemo(
    () => [...albums]
      .filter(a => a.id !== continuation?.albumId)
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 4),
    [albums, continuation?.albumId],
  );
  if (!loaded) return <Page><CardGridSkeleton /></Page>;
  if (!tracks.length) return <Welcome scanning={scanning} />;
  return (
    <Page className="home-page">
      <header className="home-header">
        <div>
          <h1 className="font-display text-display text-ink">Home</h1>
          <p className="mt-1 text-meta text-ink-3">
            {plural(tracks.length, "song")} <span className="px-1.5 text-ink-4">·</span> {plural(albums.length, "album")}
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-sm text-meta text-ink-2 hover:text-ink"
          onClick={() => navigate({ name: "library", tab: "songs" })}
        >
          Browse library <ArrowRight className="size-4" aria-hidden />
        </button>
      </header>

      {continuation ? (
        <ContinueRecord track={continuation} hasHistory={history.length > 0 || !!current} />
      ) : (
        <section className="rounded-lg border border-line px-7 py-8" aria-label="Unavailable music">
          <h2 className="text-heading text-ink">Reconnect your music</h2>
          <p className="mt-2 text-body text-ink-3">Your songs are saved in the library. Reconnect their drive or add a music folder to listen.</p>
          <Button className="mt-5" icon={FolderPlus} disabled={scanning} onClick={() => void addFolderInteractive()}>
            Add a music folder
          </Button>
        </section>
      )}

      {records.length > 0 && (
        <section className="home-records" aria-labelledby="home-records-title">
          <div className="home-shelf-heading">
            <h2 id="home-records-title" className="text-lead font-semibold text-ink">Recently added</h2>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-sm text-meta text-ink-3 hover:text-ink"
              onClick={() => navigate({ name: "library", tab: "albums" })}
            >
              All albums <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
          <div className="home-record-grid">
            {records.map(album => <AlbumCard key={album.id} album={album} />)}
          </div>
        </section>
      )}
    </Page>
  );
}

function ContinueRecord({ track, hasHistory }: { track: Track; hasHistory: boolean }) {
  const active = usePlayer(s => s.current?.id === track.id);
  const playing = usePlayer(s => s.status === "playing");
  const reduced = useReducedMotion();
  const play = () => {
    if (active) player.toggle();
    else {
      const list = albumTracks(track.albumId);
      const ids = list.length ? list.map(t => t.id) : [track.id];
      player.playTracks(ids, Math.max(0, ids.indexOf(track.id)));
    }
  };
  return (
    <ContextMenuArea entries={() => buildTrackMenu({ tracks: [track], play })}>
      <section className="home-continue" aria-label="Continue listening">
        <button
          type="button"
          aria-label={`Open ${track.album}`}
          className="home-continue-cover rounded-sm"
          onClick={() => navigate({ name: "album", id: track.albumId })}
        >
          <VinylCover
            hash={track.artwork}
            seed={track.album}
            accent={track.accent}
            fullBleed
            out
            spinning={active && playing && !reduced}
            className="w-full"
          />
        </button>
        <div className="home-continue-copy min-w-0">
          <p className="text-overline font-medium tracking-[0.12em] text-ink-3 uppercase">
            {active && playing ? "Now playing" : hasHistory ? "Continue listening" : "From your library"}
          </p>
          <h2 title={track.title} className="bidi home-continue-title font-display line-clamp-2 text-display text-ink">
            {track.title}
          </h2>
          <p className="bidi truncate text-left text-lead text-ink-2">{track.artist}</p>
          <p className="bidi mt-1 truncate text-left text-meta text-ink-3">{track.album}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={active && playing ? Pause : Play} onClick={play}>
              {active && playing ? "Pause" : hasHistory ? "Resume listening" : "Play record"}
            </Button>
            <Button variant="ghost" onClick={() => navigate({ name: "album", id: track.albumId })}>
              Open album
            </Button>
          </div>
        </div>
      </section>
    </ContextMenuArea>
  );
}

function Welcome({ scanning }: { scanning: boolean }) {
  return (
    <Page className="flex min-h-full items-center">
      <div className="grid w-full items-center gap-10 py-10 xl:grid-cols-[1.1fr_1fr]">
        <div className="max-w-[430px]">
          <h1 className="font-display text-hero">
            Your collection.
            <br />
            Your kind of music.
          </h1>
          <p className="mt-4 text-lead leading-7 text-ink-3">
            Bring your favorite records into RYLORA. Add songs or a folder to
            start listening.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              variant="primary"
              icon={FileAudio}
              onClick={() => void addFilesInteractive()}
            >
              Choose music files
            </Button>
            <Button
              icon={FolderPlus}
              disabled={scanning}
              onClick={() => void addFolderInteractive()}
            >
              {scanning ? "Adding music…" : "Add a folder"}
            </Button>
          </div>
          <p className="mt-6 text-caption leading-5 text-ink-3">
            {SUPPORTED_FORMAT_LABEL}.<br />
            Your music stays on this computer.
          </p>
        </div>
        <VinylCover
          hash={null}
          seed="RYLORA first record"
          fullBleed
          className="mx-auto hidden w-full max-w-[350px] xl:block"
        />
      </div>
    </Page>
  );
}
