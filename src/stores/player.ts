import { create } from "zustand";

import { backend } from "@/services/backend";
import type { PlayerSnapshot, RepeatMode, TrackId } from "@/types/domain";
import { notifyError } from "./toasts";

/**
 * Mirror of the backend player. The Rust player thread is authoritative; this store
 * only reflects `player://state` events. Position lives in `useProgress` so the
 * 4 Hz progress updates re-render only the components that show time.
 */
export const usePlayer = create<PlayerSnapshot & { ready: boolean }>(() => ({
  ready: false,
  status: "idle",
  current: null,
  currentUid: null,
  queue: [],
  cursor: null,
  positionMs: 0,
  durationMs: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: "off",
}));

export const useProgress = create<{ positionMs: number; durationMs: number }>(() => ({
  positionMs: 0,
  durationMs: 0,
}));

export function applySnapshot(snapshot: PlayerSnapshot): void {
  usePlayer.setState({ ...snapshot, ready: true });
  useProgress.setState({ positionMs: snapshot.positionMs, durationMs: snapshot.durationMs });
}

function run(action: () => Promise<unknown>, failure: string) {
  action().catch((e: unknown) => notifyError(failure, e));
}

const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };

/** Player intents used by the UI. Errors surface as toasts; state arrives via events. */
export const player = {
  playTracks(ids: TrackId[], start = 0) {
    if (ids.length) run(() => backend().player.playTracks(ids, start), "Couldn't start playback");
  },
  toggle: () => run(() => backend().player.toggle(), "Couldn't toggle playback"),
  next: () => run(() => backend().player.next(), "Couldn't skip"),
  previous: () => run(() => backend().player.previous(), "Couldn't go back"),
  seek(ms: number) {
    if (!Number.isFinite(ms)) return;
    const { durationMs } = useProgress.getState();
    const target = Math.max(0, durationMs ? Math.min(ms, durationMs) : ms);
    useProgress.setState({ positionMs: target });
    run(() => backend().player.seek(target), "Couldn't seek");
  },
  seekBy(deltaMs: number) {
    player.seek(useProgress.getState().positionMs + deltaMs);
  },
  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    const v = Math.min(1, Math.max(0, volume));
    usePlayer.setState({ volume: v, muted: false });
    run(() => backend().player.setVolume(v), "Couldn't change volume");
  },
  toggleMute() {
    const muted = !usePlayer.getState().muted;
    usePlayer.setState({ muted });
    run(() => backend().player.setMuted(muted), "Couldn't mute");
  },
  toggleShuffle: () => run(() => backend().player.setShuffle(!usePlayer.getState().shuffle), "Couldn't change shuffle"),
  cycleRepeat: () => run(() => backend().player.setRepeat(REPEAT_CYCLE[usePlayer.getState().repeat]), "Couldn't change repeat"),
  playNext: (ids: TrackId[]) => run(() => backend().player.playNext(ids), "Couldn't add to queue"),
  enqueue: (ids: TrackId[]) => run(() => backend().player.enqueue(ids), "Couldn't add to queue"),
  removeFromQueue: (uid: number) => run(() => backend().player.removeFromQueue(uid), "Couldn't remove from queue"),
  moveInQueue: (uid: number, to: number) => run(() => backend().player.moveInQueue(uid, to), "Couldn't reorder queue"),
  jumpTo: (uid: number) => run(() => backend().player.jumpTo(uid), "Couldn't play that track"),
  clearQueue: () => run(() => backend().player.clearQueue(), "Couldn't clear the queue"),
};
