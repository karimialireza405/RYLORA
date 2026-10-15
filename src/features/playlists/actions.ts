import { backend } from "@/services/backend";
import { refreshLibrary, useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { notifyError, toast } from "@/stores/toasts";
import type { Playlist, PlaylistId, TrackId } from "@/types/domain";
import { plural } from "@/utils/format";

export async function createPlaylist(name: string, trackIds: TrackId[]): Promise<PlaylistId | null> {
  try {
    const id = await backend().playlists.create(name, trackIds);
    await refreshLibrary();
    toast({
      tone: "success",
      title: `Created “${name.trim()}”`,
      description: trackIds.length ? `${plural(trackIds.length, "song")} added.` : undefined,
      action: { label: "Open", run: () => navigate({ name: "playlist", id }) },
    });
    return id;
  } catch (e) {
    notifyError("Couldn't create the playlist", e);
    return null;
  }
}

export async function addToPlaylist(playlist: Playlist, trackIds: TrackId[]): Promise<void> {
  try {
    await backend().playlists.add(playlist.id, trackIds);
    toast({
      tone: "success",
      title: `Added to “${playlist.name}”`,
      description: plural(trackIds.length, "song"),
      action: { label: "Open", run: () => navigate({ name: "playlist", id: playlist.id }) },
    });
    void refreshLibrary();
  } catch (e) {
    notifyError("Couldn't add to playlist", e);
  }
}

export async function renamePlaylist(id: PlaylistId, name: string): Promise<boolean> {
  try {
    await backend().playlists.rename(id, name);
    void refreshLibrary();
    return true;
  } catch (e) {
    notifyError("Couldn't rename the playlist", e);
    return false;
  }
}

export async function deletePlaylistInteractive(playlist: Playlist): Promise<boolean> {
  const ok = await backend().system.confirm(
    `Delete “${playlist.name}”? This removes the playlist only — your songs stay in the library.`,
    "Delete playlist",
    "Delete",
  );
  if (!ok) return false;
  try {
    await backend().playlists.remove(playlist.id);
    useLibrary.setState((s) => ({ playlists: s.playlists.filter((p) => p.id !== playlist.id) }));
    toast({ tone: "success", title: `Deleted “${playlist.name}”` });
    void refreshLibrary();
    return true;
  } catch (e) {
    notifyError("Couldn't delete the playlist", e);
    return false;
  }
}
