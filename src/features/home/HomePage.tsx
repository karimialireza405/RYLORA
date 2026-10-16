import { ArrowRight, FileAudio, FolderPlus, Pause, Play } from "lucide-react";
import { useMemo } from "react";
import { Page } from "@/components/layout/AppShell";
import { VinylCover } from "@/components/ui/VinylCover";
import { LibraryCover } from "@/components/ui/LibraryCover";
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
import type { CSSProperties } from "react";
import { partOfDay } from "./greeting";
import { useT } from "@/i18n";

/** A focused listening entry point: one continuation and one shelf of other records. */
export function HomePage() {
  const t = useT();
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
  const playCounts = useLibrary((s) => s.playCounts);
  const recentlyPlayed = useMemo(() => {
    const seen = new Set<number>();
    const list: Track[] = [];
    for (const entry of history) {
      const track = trackById.get(entry.trackId);
      if (!track || track.missing || seen.has(track.id)) continue;
      seen.add(track.id);
      list.push(track);
      if (list.length === SHELF_SIZE) break;
    }
    return list;
  }, [history, trackById]);
  const mostPlayed = useMemo(
    () =>
      playable
        .filter((track) => (playCounts[track.id] ?? 0) > 0)
        .sort((a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0))
        .slice(0, SHELF_SIZE),
    [playable, playCounts],
  );
  if (!loaded) return <Page><CardGridSkeleton /></Page>;
  if (!tracks.length) return <Welcome scanning={scanning} />;
  return (
    <Page className="home-page">
      <header className="home-header">
        <div>
          <h1 className="font-display text-display text-ink">{t.home.greetings[partOfDay(new Date())]}</h1>
          <p className="mt-1 text-meta text-ink-3">
            {t.count.songs(tracks.length)} <span className="px-1.5 text-ink-4">·</span> {t.count.albums(albums.length)}
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-sm text-meta text-ink-2 hover:text-ink"
          onClick={() => navigate({ name: "library", tab: "songs" })}
        >
          {t.home.browseLibrary} <ArrowRight className="size-4" aria-hidden />
        </button>
      </header>

      {continuation ? (
        <ContinueRecord track={continuation} hasHistory={history.length > 0 || !!current} />
      ) : (
        <section className="rounded-lg border border-line px-7 py-8" aria-label={t.home.unavailable}>
          <h2 className="text-heading text-ink">{t.home.reconnectTitle}</h2>
          <p className="mt-2 text-body text-ink-3">{t.home.reconnectBody}</p>
          <Button className="mt-5" icon={FolderPlus} disabled={scanning} onClick={() => void addFolderInteractive()}>
            {t.home.addMusicFolder}
          </Button>
        </section>
      )}

      {recentlyPlayed.length > 0 && (
        <TrackShelf id="home-recent" title={t.home.recentlyPlayed} tracks={recentlyPlayed} />
      )}
      {mostPlayed.length > 2 && (
        <TrackShelf
          id="home-most"
          title={t.home.mostPlayed}
          tracks={mostPlayed}
          note={(track) => t.home.plays(playCounts[track.id] ?? 0)}
        />
      )}

      {records.length > 0 && (
        <section className="home-records" aria-labelledby="home-records-title">
          <div className="home-shelf-heading">
            <h2 id="home-records-title" className="text-lead font-semibold text-ink">{t.home.recentlyAdded}</h2>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-sm text-meta text-ink-3 hover:text-ink"
              onClick={() => navigate({ name: "library", tab: "albums" })}
            >
              {t.home.allAlbums} <ArrowRight className="size-3.5" aria-hidden />
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
  const t = useT();
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
      <section
        className="home-continue"
        aria-label={t.home.continueListening}
        style={{ "--hero-tint": track.accent ?? "var(--color-accent-soft)" } as CSSProperties}
      >
        <button
          type="button"
          aria-label={t.common.openNamed(track.album)}
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
            {active && playing ? t.home.nowPlaying : hasHistory ? t.home.continueListening : t.home.fromLibrary}
          </p>
          <h2 title={track.title} className="bidi home-continue-title font-display line-clamp-2 text-display text-ink">
            {track.title}
          </h2>
          <p className="bidi truncate text-lead text-ink-2">{track.artist}</p>
          <p className="bidi mt-1 truncate text-meta text-ink-3">{track.album}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={active && playing ? Pause : Play} onClick={play}>
              {active && playing ? t.common.pause : hasHistory ? t.home.resume : t.home.playRecord}
            </Button>
            <Button variant="ghost" onClick={() => navigate({ name: "album", id: track.albumId })}>
              {t.home.openAlbum}
            </Button>
          </div>
        </div>
      </section>
    </ContextMenuArea>
  );
}

const SHELF_SIZE = 6;

/** A row of songs; choosing one plays the row from there. */
function TrackShelf({ id, title, tracks, note }: { id: string; title: string; tracks: Track[]; note?: (t: Track) => string }) {
  const currentId = usePlayer((s) => s.current?.id);
  const ids = tracks.map((track) => track.id);
  return (
    <section className="home-records" aria-labelledby={`${id}-title`}>
      <div className="home-shelf-heading">
        <h2 id={`${id}-title`} className="text-lead font-semibold text-ink">{title}</h2>
      </div>
      <ul className="home-track-grid">
        {tracks.map((track, i) => (
          <li key={track.id}>
            <ContextMenuArea entries={() => buildTrackMenu({ tracks: [track], play: () => player.playTracks(ids, i) })}>
              <button
                type="button"
                onClick={() => player.playTracks(ids, i)}
                className="group flex w-full items-center gap-3 rounded-lg p-2 text-start transition-colors hover:bg-raised/60"
                aria-current={currentId === track.id ? "true" : undefined}
              >
                <LibraryCover hash={track.artwork} seed={track.album} accent={track.accent} className="h-12 w-[62px] shrink-0" />
                <span className="min-w-0">
                  <span className={`bidi block truncate text-body ${currentId === track.id ? "glow-live text-ink" : "text-ink"}`}>{track.title}</span>
                  <span className="bidi block truncate text-meta text-ink-3">{note ? note(track) : track.artist}</span>
                </span>
              </button>
            </ContextMenuArea>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Welcome({ scanning }: { scanning: boolean }) {
  const t = useT();
  return (
    <Page className="flex min-h-full items-center">
      <div className="grid w-full items-center gap-10 py-10 xl:grid-cols-[1.1fr_1fr]">
        <div className="max-w-[430px]">
          <h1 className="font-display text-hero">
            {t.home.welcomeLine1}
            <br />
            {t.home.welcomeLine2}
          </h1>
          <p className="mt-4 text-lead leading-7 text-ink-3">
            {t.home.welcomeBody}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              variant="primary"
              icon={FileAudio}
              onClick={() => void addFilesInteractive()}
            >
              {t.home.chooseFiles}
            </Button>
            <Button
              icon={FolderPlus}
              disabled={scanning}
              onClick={() => void addFolderInteractive()}
            >
              {scanning ? t.addMusic.busy : t.home.addFolder}
            </Button>
          </div>
          <p className="mt-6 text-caption leading-5 text-ink-3">
            {t.common.supportedFormats}.<br />
            {t.home.staysLocal}
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
