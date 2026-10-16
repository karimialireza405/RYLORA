import { handleDroppedPaths } from "@/features/library/actions";
import { pushSpectrum } from "@/features/visualizer/spectrumBus";
import { initBackend } from "@/services/backend";
import { loadAudioSettings, useAudio } from "@/stores/audio";
import { checkOnLaunch, onUpdateProgress } from "@/stores/updates";
import { refreshLibrary, useLibrary } from "@/stores/library";
import { applySnapshot, usePlayer, useProgress } from "@/stores/player";
import { toast } from "@/stores/toasts";
import { applyAccentPreference, applyMotionPreference, useUi } from "@/stores/ui";
import type { Preferences } from "@/types/domain";
import { messages } from "@/i18n";

let started: Promise<void> | null = null;

/**
 * One-time startup: resolve the backend, load preferences and subscribe to backend
 * events. Resolves as soon as the shell can render; the initial player and library
 * fetches continue in the background (listeners are registered first so no update
 * can slip through the gap).
 */
export function bootstrap(): Promise<void> {
  started ??= start();
  return started;
}

async function start(): Promise<void> {
  const api = await initBackend();

  const prefs = await api.settings.get().catch((): Preferences => ({}));
  useUi.setState({ prefs, nowPlayingPanelOpen: prefs.panelVisible !== "false" });
  applyMotionPreference(prefs.motion);
  applyAccentPreference(prefs.accentColor);

  let refreshTimer = 0;
  const scheduleRefresh = () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => void refreshLibrary(), 120);
  };

  await Promise.all([
    api.on("player://state", applySnapshot),
    api.on("player://progress", (p) => useProgress.setState(p)),
    api.on("player://spectrum", pushSpectrum),
    api.on("player://error", (e) => toast({ tone: "error", title: messages().errors.playbackProblem, description: e.message })),
    api.on("library://scan-progress", (p) => useLibrary.setState({ scanning: true, scanProgress: p })),
    api.on("library://scan-finished", (summary) => {
      useLibrary.setState({ scanning: false, scanProgress: null, lastScanSummary: summary });
      if (summary.cancelled) {
        toast({ tone: "info", title: messages().scan.stopped });
      } else if (summary.addedOrUpdated > 0 || summary.missing > 0) {
        const parts = [
          summary.addedOrUpdated > 0 && messages().scan.addedOrUpdated(summary.addedOrUpdated),
          summary.missing > 0 && messages().scan.missing(summary.missing),
        ].filter(Boolean);
        toast({ tone: "success", title: messages().scan.libraryUpdated, description: parts.join(" · ") });
      }
      if (summary.failed.length > 0) {
        toast({
          tone: "error",
          title: messages().scan.unreadable(summary.failed.length),
          description: summary.failed.slice(0, 2).join("\n") + (summary.failed.length > 2 ? "\n…" : ""),
        });
      }
      if (summary.unavailableFolders.length > 0) {
        toast({ tone: "error", title: messages().collections.folderUnavailable, description: summary.unavailableFolders.join("\n") });
      }
      scheduleRefresh();
    }),
    api.on("library://changed", scheduleRefresh),
    api.on("audio://loudness", (loudness) => useAudio.setState({ loudness })),
    api.on("updates://progress", onUpdateProgress),
    api.system.window.onFileDrop((paths, kind) => {
      if (kind === "enter") useUi.setState({ dropActive: true });
      else if (kind === "leave") useUi.setState({ dropActive: false });
      else {
        useUi.setState({ dropActive: false });
        void handleDroppedPaths(paths);
      }
    }),
  ]);

  void api.player
    .state()
    .then(applySnapshot)
    .catch(() => usePlayer.setState({ ready: true }));
  void refreshLibrary();
  void loadAudioSettings();
  void checkOnLaunch(prefs.checkUpdates === "true");
}
