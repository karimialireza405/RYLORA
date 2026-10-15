import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  library: { importFiles: vi.fn(), addFolder: vi.fn() },
  system: { pickAudioFiles: vi.fn(), pickFolder: vi.fn() },
}));
vi.mock("@/services/backend", () => ({ backend: () => api }));
vi.mock("@/stores/library", async (original) => ({
  ...await original<typeof import("@/stores/library")>(), refreshLibrary: vi.fn(async () => {}),
}));
vi.mock("@/stores/player", () => ({ player: { playTracks: vi.fn() } }));
vi.mock("@/stores/toasts", () => ({ toast: vi.fn(), notifyError: vi.fn() }));
vi.mock("@/stores/navigation", () => ({ navigate: vi.fn() }));

import { useLibrary, refreshLibrary } from "@/stores/library";
import { player } from "@/stores/player";
import { notifyError } from "@/stores/toasts";
import { addFilesInteractive, handleDroppedPaths, importMusicFiles } from "./actions";

beforeEach(() => { vi.clearAllMocks(); useLibrary.setState({ importing: false, tracks: [] }); });

describe("personal music import", () => {
  it("cancelling the picker leaves the library and playback alone", async () => {
    api.system.pickAudioFiles.mockResolvedValue([]);
    expect(await addFilesInteractive()).toBeNull();
    expect(api.library.importFiles).not.toHaveBeenCalled();
    expect(player.playTracks).not.toHaveBeenCalled();
  });

  it("deduplicates songs and reports partial failures without interrupting playback", async () => {
    api.library.importFiles.mockResolvedValue({ trackIds: [1, 1, 2], rejected: ["broken.mp3"] });
    const result = await importMusicFiles(["a.mp3", "a.mp3", "b.FLAC", "broken.mp3", "notes.txt"]);
    expect(api.library.importFiles).toHaveBeenCalledWith(["a.mp3", "b.FLAC", "broken.mp3"]);
    expect(result).toEqual({ trackIds: [1, 2], rejected: ["broken.mp3", "notes.txt"], added: 2, existing: 0 });
    expect(refreshLibrary).toHaveBeenCalledOnce();
    expect(player.playTracks).not.toHaveBeenCalled();
    expect(useLibrary.getState().importing).toBe(false);
  });

  it("clears the busy state after an import fails", async () => {
    api.library.importFiles.mockRejectedValue(new Error("Unreadable file"));
    expect(await importMusicFiles(["a.mp3"])).toBeNull();
    expect(useLibrary.getState().importing).toBe(false);
    expect(notifyError).toHaveBeenCalledOnce();
  });

  it("prevents overlapping imports", async () => {
    useLibrary.setState({ importing: true });
    expect(await importMusicFiles(["a.mp3"])).toBeNull();
    expect(api.library.importFiles).not.toHaveBeenCalled();
  });

  it("reports existing songs separately and retains details when all files fail", async () => {
    useLibrary.setState({tracks:[{id:1} as import("@/types/domain").Track]});
    api.library.importFiles.mockResolvedValueOnce({trackIds:[1,2],rejected:[]});
    expect(await importMusicFiles(["a.mp3","b.mp3"])).toMatchObject({added:1,existing:1});
    api.library.importFiles.mockResolvedValueOnce({trackIds:[],rejected:["bad.mp3"]});
    expect(await importMusicFiles(["bad.mp3"])).toMatchObject({trackIds:[],rejected:["bad.mp3"],added:0,existing:0});
  });

  it("dropping audio adds it without replacing the listening session", async () => {
    api.library.importFiles.mockResolvedValue({trackIds:[1],rejected:[]});
    await handleDroppedPaths(["a.mp3"]);
    expect(player.playTracks).not.toHaveBeenCalled();
  });

  it("accepts dropped folders whose names contain dots", async () => {
    api.library.addFolder.mockResolvedValue(undefined);
    await handleDroppedPaths(["D:/Music/Collection.2026"]);
    expect(api.library.addFolder).toHaveBeenCalledWith("D:/Music/Collection.2026");
    expect(refreshLibrary).toHaveBeenCalledOnce();
  });
});
