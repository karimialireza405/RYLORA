import { useLibrary } from "@/stores/library";
import { usePlayer } from "@/stores/player";

/** Use the latest library cover colour, including edits made during playback. */
export function usePlaybackAccent(): string {
  const trackId = usePlayer((s) => s.current?.id ?? null);
  const snapshotAccent = usePlayer((s) => s.current?.accent ?? null);
  const accent = useLibrary((s) => {
    const track = trackId === null ? undefined : s.trackById.get(trackId);
    return track ? track.accent : snapshotAccent;
  });
  return /^#[0-9a-f]{6}$/i.test(accent ?? "") ? accent! : "#d7eee9";
}
