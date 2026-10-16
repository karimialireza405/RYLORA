import { Maximize2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";

import { LibraryCover } from "@/components/ui/LibraryCover";
import { activateLanguage, isRtlLanguage, useT, usePreferredLanguage } from "@/i18n";
import { initBackend, backend } from "@/services/backend";
import { applySnapshot, player, usePlayer, useProgress } from "@/stores/player";
import { applyAccentPreference, applyMotionPreference, useUi } from "@/stores/ui";
import type { Preferences } from "@/types/domain";
import { cn } from "@/utils/cn";
import { formatTime } from "@/utils/format";

/**
 * The mini player window: cover, title, transport and timeline, always on top.
 * It mirrors the player in the main process through the same events as the main window.
 */
export function MiniApp() {
  const [ready, setReady] = useState(false);
  const lang = usePreferredLanguage();
  activateLanguage(lang);
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtlLanguage(lang) ? "rtl" : "ltr";
  }, [lang]);

  useEffect(() => {
    void (async () => {
      const api = await initBackend();
      const prefs = await api.settings.get().catch((): Preferences => ({}));
      useUi.setState({ prefs });
      applyMotionPreference(prefs.motion);
      applyAccentPreference(prefs.accentColor);
      await Promise.all([
        api.on("player://state", applySnapshot),
        api.on("player://progress", (p) => useProgress.setState(p)),
      ]);
      applySnapshot(await api.player.state());
      setReady(true);
    })();
  }, []);

  return ready ? <MiniPlayer /> : <div className="h-full bg-obsidian" />;
}

function MiniPlayer() {
  const t = useT();
  const track = usePlayer((s) => s.current);
  const status = usePlayer((s) => s.status);
  const playing = status === "playing" || status === "loading";
  const { positionMs, durationMs } = useProgress();
  const ratio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const expand = () => void backend().system.window.closeMini();

  return (
    <div
      data-tauri-drag-region
      className="mini-player relative flex h-full select-none items-center gap-3 overflow-hidden bg-obsidian px-3"
    >
      {/* Lit by the cover, like the rest of RYLORA. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 70% 140% at 12% 50%, color-mix(in srgb, var(--now-tint) 26%, transparent), transparent 70%)" }}
      />
      <div className="relative shrink-0" data-tauri-drag-region>
        {track ? (
          <LibraryCover hash={track.artwork} seed={track.album} accent={track.accent} className="h-[76px] w-[99px]" />
        ) : (
          <div className="h-[76px] w-[76px] rounded-sm bg-deep" />
        )}
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col gap-2" data-tauri-drag-region>
        <div className="min-w-0" data-tauri-drag-region>
          <p className="bidi truncate text-body text-ink glow-soft" data-tauri-drag-region>
            {track?.title ?? t.playbackBar.nothingPlaying}
          </p>
          <p className="bidi truncate text-meta text-ink-3" data-tauri-drag-region>
            {track?.artist ?? t.playbackBar.pickSong}
          </p>
        </div>
        <div dir="ltr" className="flex items-center gap-1">
          <MiniButton label={t.player.previous} onClick={player.previous} disabled={!track}>
            <SkipBack className="size-4 fill-current" />
          </MiniButton>
          <button
            type="button"
            onClick={player.toggle}
            disabled={!track}
            aria-label={playing ? t.common.pause : t.common.play}
            data-playing={status === "playing" || undefined}
            className="transport-play grid size-9 place-items-center rounded-full bg-blue-soft text-obsidian shadow-transport disabled:opacity-40"
          >
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="ms-0.5 size-4 fill-current" />}
          </button>
          <MiniButton label={t.player.next} onClick={player.next} disabled={!track}>
            <SkipForward className="size-4 fill-current" />
          </MiniButton>
          <span className="tabular ms-auto text-caption text-ink-3">
            {formatTime(positionMs)} / {formatTime(durationMs)}
          </span>
        </div>
      </div>

      <div className="relative flex flex-col gap-1 self-stretch py-2">
        <MiniButton label={t.mini.expand} onClick={expand}>
          <Maximize2 className="size-4" />
        </MiniButton>
      </div>

      {/* Timeline along the bottom edge. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/8">
        <div
          className="h-full bg-blue-soft shadow-[0_0_10px_color-mix(in_srgb,var(--now-tint)_80%,transparent)] transition-[width] duration-300 ease-linear"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function MiniButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn("grid size-8 place-items-center rounded-full text-ink-2 transition-colors hover:bg-white/8 hover:text-ink disabled:opacity-40")}
    >
      {children}
    </button>
  );
}
