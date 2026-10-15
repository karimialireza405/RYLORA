import { backend } from "@/services/backend";
import { refreshLibrary, useLibrary } from "@/stores/library";
import { player } from "@/stores/player";
import { notifyError, toast } from "@/stores/toasts";
import { navigate } from "@/stores/navigation";
import type { LibraryFolder } from "@/types/domain";
import { isSupportedAudioPath } from "@/utils/formats";
import { messages } from "@/i18n";

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
      title: messages().importing.addingFolder,
      description: messages().importing.scanningPath(path),
    });
    await refreshLibrary();
    return true;
  } catch (e) {
    notifyError(messages().importing.addFolderFailed, e);
    return false;
  }
}

export async function removeFolderInteractive(
  folder: LibraryFolder,
): Promise<void> {
  const ok = await backend().system.confirm(
    messages().importing.removeFolderPrompt(folder.path, folder.trackCount),
    messages().importing.removeFolderTitle,
    messages().common.remove,
  );
  if (!ok) return;
  try {
    await backend().library.removeFolder(folder.id);
    toast({ tone: "success", title: messages().importing.folderRemoved });
    void refreshLibrary();
  } catch (e) {
    notifyError(messages().importing.removeFolderFailed, e);
  }
}

export async function rescanLibrary(): Promise<void> {
  try {
    await backend().library.rescan();
    await refreshLibrary();
  } catch (e) {
    notifyError(messages().importing.scanFailed, e);
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
    notifyError(messages().importing.chooseFilesFailed, e);
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
      title: messages().importing.waitForImport,
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
        title: messages().importing.readyInLibrary(ids.length),
        description: rejected
          ? messages().importing.unreadableFiles(rejected)
          : undefined,
        action: { label: messages().common.play, run: () => player.playTracks(ids, 0) },
      });
      navigate({ name: "library", tab: "recent" });
      return result;
    } else {
      toast({
        tone: "error",
        title: messages().importing.nothingAdded,
        description: messages().importing.playsFormats(messages().common.supportedFormats),
      });
      return result;
    }
  } catch (e) {
    notifyError(messages().importing.addFilesFailed, e);
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
      toast({ tone: "info", title: messages().importing.addingFolder, description: folder });
      await refreshLibrary();
    } catch (e) {
      notifyError(messages().importing.addFolderFailed, e);
    }
  }
  if (files.length) {
    await importMusicFiles(files);
  } else if (!others.length) {
    toast({
      tone: "error",
      title: messages().importing.unsupportedFiles,
      description: messages().importing.playsFormats(messages().common.supportedFormats),
    });
  }
}
