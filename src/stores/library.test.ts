import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  library: { snapshot: vi.fn(), folders: vi.fn(async () => []), recentPlays: vi.fn(async () => []) },
  playlists: { list: vi.fn(async () => []) },
}));
vi.mock("@/services/backend", () => ({ backend: () => api }));
vi.mock("./toasts", () => ({ notifyError: vi.fn() }));
import { refreshLibrary, useLibrary } from "./library";

const snapshot = (scanning: boolean) => ({ tracks: [], albums: [], artists: [], playCounts: {}, scanning });
beforeEach(() => { vi.clearAllMocks(); });

it("a final snapshot clears a stale scanning indicator", async () => {
  useLibrary.setState({ scanning: true });
  api.library.snapshot.mockResolvedValue(snapshot(false));
  await refreshLibrary();
  expect(useLibrary.getState().scanning).toBe(false);
});

it("all concurrent refresh callers wait for the queued, freshest snapshot", async () => {
  let finishFirst!: (value: ReturnType<typeof snapshot>) => void;
  let finishSecond!: (value: ReturnType<typeof snapshot>) => void;
  api.library.snapshot.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
  const first = refreshLibrary();
  const second = refreshLibrary();
  expect(second).toBe(first);
  finishFirst(snapshot(true));
  await vi.waitFor(() => expect(api.library.snapshot).toHaveBeenCalledTimes(2));
  let settled = false;
  void second.then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  finishSecond(snapshot(false));
  await Promise.all([first, second]);
  expect(useLibrary.getState().scanning).toBe(false);
});
