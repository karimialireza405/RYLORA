import { Segmented, Switch } from "@/components/ui/Controls";
import { Slider } from "@/components/ui/Slider";
import { useT } from "@/i18n";
import { CROSSFADE_MAX_S, CROSSFADE_MIN_S, setCrossfade, setLeveling, useAudio } from "@/stores/audio";
import type { LevelingMode, LevelingTarget } from "@/types/domain";
import { cn } from "@/utils/cn";

/** Volume levelling and crossfade, shown in the Sound dialog and in Settings. */
export function PlaybackOptions() {
  return (
    <div className="divide-y divide-line">
      <Leveling />
      <Crossfade />
    </div>
  );
}

function Leveling() {
  const t = useT();
  const leveling = useAudio((s) => s.leveling);
  const progress = useAudio((s) => s.loudness);
  const on = leveling.mode !== "off";
  const done = progress.total > 0 && progress.measured >= progress.total;
  const pct = progress.total > 0 ? Math.round((progress.measured / progress.total) * 100) : 0;

  return (
    <section aria-label={t.sound.leveling} className="pb-5">
      <p className="text-body font-medium text-ink">{t.sound.leveling}</p>
      <p className="mt-0.5 text-meta text-ink-3">{t.sound.levelingHint}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Segmented<LevelingMode>
          label={t.sound.leveling}
          value={leveling.mode}
          onChange={(mode) => void setLeveling({ mode })}
          options={(["off", "track", "album"] as const).map((value) => ({ value, label: t.sound.levelingModes[value] }))}
        />
      </div>
      <p className="mt-2 text-meta text-ink-3">{t.sound.levelingModeHints[leveling.mode]}</p>

      {on && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-body text-ink-2">{t.sound.target}</p>
            <Segmented<LevelingTarget>
              label={t.sound.target}
              value={leveling.target}
              onChange={(target) => void setLeveling({ target })}
              options={(["quiet", "normal", "loud"] as const).map((value) => ({ value, label: t.sound.targets[value] }))}
            />
          </div>
          <p className="mt-2 text-caption text-ink-4">{t.sound.targetHint}</p>

          {progress.total > 0 && (
            <div className="mt-4" role="status">
              <p className="text-meta text-ink-3">{done ? t.sound.measured(progress.total) : t.sound.measuring(progress.measured, progress.total)}</p>
              {!done && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                  <div className="h-full rounded-full bg-blue-soft transition-[width] duration-500" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Crossfade() {
  const t = useT();
  const crossfade = useAudio((s) => s.crossfade);
  return (
    <section aria-label={t.sound.crossfade} className="pt-2">
      <Switch label={t.sound.crossfade} description={t.sound.crossfadeHint} checked={crossfade.enabled} onChange={(enabled) => setCrossfade({ enabled })} />
      <div className={cn("transition-opacity", !crossfade.enabled && "pointer-events-none opacity-45")} aria-disabled={!crossfade.enabled}>
        <div className="flex max-w-xl items-center gap-4 py-3">
          <p className="w-28 shrink-0 text-body text-ink-2">{t.sound.crossfadeLength}</p>
          <Slider
            min={CROSSFADE_MIN_S}
            max={CROSSFADE_MAX_S}
            step={0.5}
            value={crossfade.seconds}
            label={t.sound.crossfadeLength}
            valueText={t.sound.seconds(crossfade.seconds)}
            disabled={!crossfade.enabled}
            onChange={(seconds) => setCrossfade({ seconds })}
            showThumb
          />
          <span className="tabular w-16 shrink-0 text-end text-meta text-ink-2">{t.sound.seconds(crossfade.seconds)}</span>
        </div>
        <Switch
          label={t.sound.keepAlbumsGapless}
          description={t.sound.keepAlbumsGaplessHint}
          checked={crossfade.keepAlbumsGapless}
          onChange={(keepAlbumsGapless) => setCrossfade({ keepAlbumsGapless })}
        />
      </div>
    </section>
  );
}
