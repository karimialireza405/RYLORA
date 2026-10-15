import { backend } from "@/services/backend";
import { refreshLibrary, useLibrary } from "@/stores/library";
import { player } from "@/stores/player";
import { notifyError, toast } from "@/stores/toasts";
import { navigate } from "@/stores/navigation";
import type { LibraryFolder } from "@/types/domain";
import { isSupportedAudioPath, SUPPORTED_FORMAT_LABEL } from "@/utils/formats";
import { plural } from "@/utils/format";

export interface ImportOutcome {
  trackIds: number[];
  rejected: string[];
  added: number;
  existing: number;
}

export async function addFolderInteractive(): Promise<boolean> {
  try {
    const path = await backend().system.pickFolder();
    if (!path) return false;
    useLibrary.setState({ lastScanSummary: null });
    await backend().library.addFolder(path);
    toast({
      tone: "info",
      title: "Adding folder",
      description: `Scanning ${path} in the background.`,
    });
    await refreshLibrary();
    return true;
  } catch (e) {
    notifyError("Couldn't add that folder", e);
    return false;
  }
}

export async function removeFolderInteractive(
  folder: LibraryFolder,
): Promise<void> {
  const ok = await backend().system.confirm(
    `Remove "${folder.path}" from your library?\n\nIts ${plural(folder.trackCount, "song")} will leave your library, playlists and favorites. Files on disk are not touched.`,
    "Remove folder",
    "Remove",
  );
  if (!ok) return;
  try {
    await backend().library.removeFolder(folder.id);
    toast({ tone: "success", title: "Folder removed" });
    void refreshLibrary();
  } catch (e) {
    notifyError("Couldn't remove that folder", e);
  }
}

export async function rescanLibrary(): Promise<void> {
  try {
    await backend().library.rescan();
    await refreshLibrary();
  } catch (e) {
    notifyError("Couldn't start a scan", e);
  }
}

/** Import loose files and start playing them in the order given. */
export async function importAndPlay(paths: string[]): Promise<void> {
  const result = await importMusicFiles(paths);
  if (result?.trackIds.length) {
    player.playTracks(result.trackIds, 0);
    navigate({ name: "nowPlaying" });
  }
}

/** Pick individual files and add them to the library (without interrupting playback). */
export async function addFilesInteractive(): Promise<ImportOutcome | null> {
  try {
    const paths = await backend().system.pickAudioFiles();
    return paths.length ? await importMusicFiles(paths) : null;
  } catch (e) {
    notifyError("Couldn't choose those files", e);
    return null;
  }
}

/** Shared real import path for file pickers, drops and open-file shortcuts. */
export async function importMusicFiles(
  paths: string[],
): Promise<ImportOutcome | null> {
  if (useLibrary.getState().importing) {
    toast({
      tone: "info",
      title: "Please wait for your current import to finish",
    });
    return null;
  }
  useLibrary.setState({ importing: true });
  try {
    const unique = [...new Set(paths)];
    const audio = unique.filter(isSupportedAudioPath);
    const unsupported = unique.filter((p) => !isSupportedAudioPath(p));
    const before = new Set(useLibrary.getState().tracks.map((t) => t.id));
    const imported = audio.length
      ? await backend().library.importFiles(audio)
      : { trackIds: [], rejected: [] };
    const ids = [...new Set(imported.trackIds)];
    const result = {
      trackIds: ids,
      rejected: [...imported.rejected, ...unsupported],
      added: ids.filter((id) => !before.has(id)).length,
      existing: ids.filter((id) => before.has(id)).length,
    };
    await refreshLibrary();
    const rejected = result.rejected.length;
    if (result.trackIds.length) {
      const ids = result.trackIds;
      toast({
        tone: "success",
        title: `${plural(ids.length, "song")} ready in your library`,
        description: rejected
          ? `${plural(rejected, "file")} couldn't be read.`
          : undefined,
        action: { label: "Play", run: () => player.playTracks(ids, 0) },
      });
      navigate({ name: "library", tab: "recent" });
      return result;
    } else {
      toast({
        tone: "error",
        title: "Nothing was added",
        description: `RYLORA plays ${SUPPORTED_FORMAT_LABEL}.`,
      });
      return result;
    }
  } catch (e) {
    notifyError("Couldn't add those files", e);
  } finally {
    useLibrary.setState({ importing: false });
  }
  return null;
}

/** Dropped items join the library without interrupting the listening session. */
export async function handleDroppedPaths(paths: string[]): Promise<void> {
  const files = paths.filter(isSupportedAudioPath);
  // Let the backend check directory existence; real folder names can contain dots.
  const others = paths.filter((p) => !isSupportedAudioPath(p));
  for (const folder of others) {
    try {
      await backend().library.addFolder(folder);
      toast({ tone: "info", title: "Adding folder", description: folder });
      await refreshLibrary();
    } catch (e) {
      notifyError("Couldn't add that folder", e);
    }
  }
  if (files.length) {
    await importMusicFiles(files);
  } else if (!others.length) {
    toast({
      tone: "error",
      title: "Unsupported files",
      description: `RYLORA plays ${SUPPORTED_FORMAT_LABEL}.`,
    });
  }
}
