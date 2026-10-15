import { backend } from "@/services/backend";
import { refreshLibrary, useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { notifyError, toast } from "@/stores/toasts";
import type { Playlist, PlaylistId, TrackId } from "@/types/domain";
import { messages } from "@/i18n";

export async function createPlaylist(name: string, trackIds: TrackId[]): Promise<PlaylistId | null> {
  try {
    const id = await backend().playlists.create(name, trackIds);
    await refreshLibrary();
    toast({
      tone: "success",
      title: messages().playlists.created(name.trim()),
      description: trackIds.length ? messages().playlists.songsAdded(trackIds.length) : undefined,
      action: { label: messages().playlists.open, run: () => navigate({ name: "playlist", id }) },
    });
    return id;
  } catch (e) {
    notifyError(messages().playlists.createFailed, e);
    return null;
  }
}

export async function addToPlaylist(playlist: Playlist, trackIds: TrackId[]): Promise<void> {
  try {
    await backend().playlists.add(playlist.id, trackIds);
    toast({
      tone: "success",
      title: messages().playlists.addedTo(playlist.name),
      description: messages().count.songs(trackIds.length),
      action: { label: messages().playlists.open, run: () => navigate({ name: "playlist", id: playlist.id }) },
    });
    void refreshLibrary();
  } catch (e) {
    notifyError(messages().playlists.addFailed, e);
  }
}

export async function renamePlaylist(id: PlaylistId, name: string): Promise<boolean> {
  try {
    await backend().playlists.rename(id, name);
    void refreshLibrary();
    return true;
  } catch (e) {
    notifyError(messages().playlists.renameFailed, e);
    return false;
  }
}

export async function deletePlaylistInteractive(playlist: Playlist): Promise<boolean> {
  const ok = await backend().system.confirm(
    messages().playlists.deleteConfirm(playlist.name),
    messages().playlists.delete,
    messages().common.delete,
  );
  if (!ok) return false;
  try {
    await backend().playlists.remove(playlist.id);
    useLibrary.setState((s) => ({ playlists: s.playlists.filter((p) => p.id !== playlist.id) }));
    toast({ tone: "success", title: messages().playlists.deleted(playlist.name) });
    void refreshLibrary();
    return true;
  } catch (e) {
    notifyError(messages().playlists.deleteFailed, e);
    return false;
  }
}
