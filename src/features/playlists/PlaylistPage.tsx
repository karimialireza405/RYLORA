import { ListMusic, Music2, Pencil, Play, Shuffle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Page } from "@/components/layout/AppShell";
import { EmptyState, Skeleton } from "@/components/feedback/EmptyState";
import { Mosaic } from "@/components/ui/Artwork";
import { VinylCover } from "@/components/ui/VinylCover";
import { Button, IconButton } from "@/components/ui/Button";
import { CollectionHero, Dot } from "@/features/library/CollectionHero";
import { playFrom, TrackTable } from "@/features/library/TrackTable";
import { backend } from "@/services/backend";
import { refreshLibrary, useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { player, usePlayer } from "@/stores/player";
import { notifyError, toast } from "@/stores/toasts";
import type { PlaylistEntry, Track } from "@/types/domain";
import { formatLongDuration, formatRelativeDate, plural } from "@/utils/format";
import { deletePlaylistInteractive } from "./actions";
import { RenamePlaylistDialog } from "./NewPlaylistDialog";

export function PlaylistPage({ id }: { id: number }) {
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id));
  const trackById = useLibrary((s) => s.trackById);
  const loaded = useLibrary((s) => s.loaded);
  const [entries, setEntries] = useState<PlaylistEntry[] | null>(null);
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntries(await backend().playlists.entries(id));
    } catch (e) {
      notifyError("Couldn't load the playlist", e);
      setEntries([]);
    }
  }, [id]);

  // Reload when the playlist changes anywhere (its updatedAt moves).
  useEffect(() => {
    void load();
  }, [load, playlist?.updatedAt]);

  const rows = useMemo(() => {
    const list: Array<{ entry: PlaylistEntry; track: Track }> = [];
    for (const entry of entries ?? []) {
      const track = trackById.get(entry.trackId);
      if (track) list.push({ entry, track: { ...track, addedAt: entry.addedAt } });
    }
    return list;
  }, [entries, trackById]);
  const tracks = useMemo(() => rows.map((r) => r.track), [rows]);
  const playable = tracks.filter((t) => !t.missing).map((t) => t.id);

  const move = useCallback(
    async (from: number, to: number) => {
      const row = rows[from];
      if (!row || !entries) return;
      // Optimistic reorder; the backend is the source of truth on the next load.
      const next = [...entries];
      const i = next.findIndex((e) => e.entryId === row.entry.entryId);
      const [moved] = next.splice(i, 1);
      next.splice(to, 0, moved!);
      setEntries(next);
      try {
        await backend().playlists.move(id, row.entry.entryId, to);
      } catch (e) {
        notifyError("Couldn't reorder", e);
        void load();
      }
    },
    [entries, id, load, rows],
  );

  const remove = useCallback(
    async (indexes: number[]) => {
      const entryIds = indexes.map((i) => rows[i]?.entry.entryId).filter((x): x is number => x !== undefined);
      if (!entryIds.length) return;
      setEntries((prev) => prev?.filter((e) => !entryIds.includes(e.entryId)) ?? null);
      try {
        await backend().playlists.removeEntries(id, entryIds);
        toast({ tone: "success", title: `Removed ${plural(entryIds.length, "song")}` });
        void refreshLibrary();
      } catch (e) {
        notifyError("Couldn't remove from playlist", e);
        void load();
      }
    },
    [id, load, rows],
  );

  if (!playlist) {
    return (
      <Page>
        {loaded && (
          <EmptyState icon={ListMusic} title="Playlist not found" description="It may have been deleted.">
            <Button onClick={() => navigate({ name: "playlists" })}>All playlists</Button>
          </EmptyState>
        )}
      </Page>
    );
  }

  return (
    <div className="pb-16">
      <CollectionHero
        overline="Playlist"
        title={playlist.name}
        onTitleClick={() => setRenaming(true)}
        art={
          <VinylCover
            fullBleed
            hash={playlist.artworks[0]}
            seed={playlist.name}
            artist="Playlist"
            title={playlist.name}
            inset={<Mosaic hashes={playlist.artworks} seed={playlist.name} size="lg" className="h-full w-full rounded-none" />}
            style={{ height: "232px", width: "calc(232px * 1.3)" }}
          />
        }
        accent={playlist.artworks.length ? (tracks.find((t) => t.accent)?.accent ?? null) : null}
        meta={
          <>
            <span>{plural(playlist.trackCount, "song")}</span>
            {playlist.durationMs > 0 && (
              <>
                <Dot />
                <span>{formatLongDuration(playlist.durationMs)}</span>
              </>
            )}
            <Dot />
            <span>Updated {formatRelativeDate(playlist.updatedAt).toLowerCase()}</span>
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
            <IconButton icon={Pencil} label="Rename playlist" className="bg-raised/70" onClick={() => setRenaming(true)} />
            <IconButton
              icon={Trash2}
              label="Delete playlist"
              className="bg-raised/70 hover:text-danger"
              onClick={async () => {
                if (await deletePlaylistInteractive(playlist)) navigate({ name: "playlists" }, { replace: true });
              }}
            />
          </>
        }
      />
      <div className="mx-auto w-full max-w-[1680px] px-8">
        {entries === null ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <EmptyState
            icon={Music2}
            title="This playlist is empty"
            description="Right-click any song in your library and choose “Add to playlist”, or select several with Ctrl/Shift first."
          >
            <Button onClick={() => navigate({ name: "library", tab: "songs" })}>Browse songs</Button>
          </EmptyState>
        ) : (
          <>
            <TrackTable
              label={`${playlist.name} tracks`}
              variant="playlist"
              tracks={tracks}
              onPlay={(i) => playFrom(tracks, i, player.playTracks)}
              onMove={(from, to) => void move(from, to)}
              onRemove={(idx) => void remove(idx)}
            />
            <p className="mt-4 text-caption text-ink-4">Drag the handle or press Alt+↑/↓ to reorder. Delete removes the selected songs.</p>
          </>
        )}
      </div>
      <RenamePlaylistDialog id={playlist.id} current={playlist.name} open={renaming} onClose={() => setRenaming(false)} />
    </div>
  );
}
