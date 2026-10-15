import * as RadixSlider from "@radix-ui/react-slider";
import { Check, ChevronDown, RotateCcw, Speaker } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Dialog";
import { DropdownMenuButton, type MenuEntry } from "@/components/ui/Menu";
import { useT } from "@/i18n";
import {
  applyPreset,
  EQ_BANDS,
  EQ_LIMIT_DB,
  matchPreset,
  PRESETS,
  setOutputDevice,
  updateEqualizer,
  useAudio,
  type PresetId,
} from "@/stores/audio";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";

function bandLabel(hz: number): string {
  return hz >= 1000 ? `${formatNumber(hz / 1000)}K` : formatNumber(hz);
}

function formatDb(db: number): string {
  const v = Math.round(db * 2) / 2;
  return `${v > 0 ? "+" : ""}${formatNumber(v)}`;
}

/** Output device and equalizer, reachable from the playback bar and Settings. */
export function SoundDialog() {
  const t = useT();
  const open = useAudio((s) => s.open);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => useAudio.setState({ open: o })}
      title={t.sound.title}
      className="w-[min(680px,calc(100vw-48px))]"
    >
      <div className="space-y-6">
        <OutputDevicePicker />
        <Equalizer />
      </div>
    </Dialog>
  );
}

export function OutputDevicePicker() {
  const t = useT();
  const devices = useAudio((s) => s.devices);
  const chosen = useAudio((s) => s.outputDevice);
  const defaultDevice = devices.find((d) => d.isDefault);
  const chosenDevice = devices.find((d) => d.id === chosen);
  const label = chosen === null
    ? defaultDevice
      ? t.sound.systemDefaultNamed(defaultDevice.name)
      : t.sound.systemDefault
    : (chosenDevice?.name ?? chosen);

  const entries = (): MenuEntry[] => [
    {
      type: "item",
      label: defaultDevice ? t.sound.systemDefaultNamed(defaultDevice.name) : t.sound.systemDefault,
      icon: chosen === null ? Check : undefined,
      onSelect: () => void setOutputDevice(null),
    },
    ...(devices.length ? [{ type: "separator" } as const] : []),
    ...devices.map(
      (d): MenuEntry => ({ type: "item", label: d.name, icon: chosen === d.id ? Check : undefined, onSelect: () => void setOutputDevice(d.id) }),
    ),
  ];

  return (
    <div>
      <p className="mb-2 text-body font-medium text-ink">{t.sound.output}</p>
      <DropdownMenuButton entries={entries} align="start">
        <button
          type="button"
          className="flex h-10 w-full items-center gap-3 rounded-md bg-raised px-3 text-start text-body text-ink ring-1 ring-line-strong ring-inset transition-colors hover:bg-lifted"
        >
          <Speaker className="size-4 shrink-0 text-ink-3" aria-hidden />
          <span className="bidi min-w-0 flex-1 truncate">{label}</span>
          <ChevronDown className="size-4 shrink-0 text-ink-3" aria-hidden />
        </button>
      </DropdownMenuButton>
      <p className="mt-2 text-meta text-ink-3">{t.sound.outputHint}</p>
    </div>
  );
}

function Equalizer() {
  const t = useT();
  const eq = useAudio((s) => s.equalizer);
  const preset = matchPreset(eq);
  const presetEntries = (): MenuEntry[] =>
    (Object.keys(PRESETS) as PresetId[]).map((id) => ({
      type: "item",
      label: t.sound.presets[id],
      icon: preset === id ? Check : undefined,
      onSelect: () => applyPreset(id),
    }));

  return (
    <section aria-label={t.sound.equalizer} className="border-t border-line pt-2">
      <Switch label={t.sound.enabled} description={t.sound.equalizerHint} checked={eq.enabled} onChange={(enabled) => updateEqualizer({ enabled })} />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <DropdownMenuButton entries={presetEntries} align="start">
          <Button variant="secondary" size="sm" className="gap-1.5">
            {t.sound.preset}: {preset ? t.sound.presets[preset] : t.sound.custom}
            <ChevronDown className="size-3.5" aria-hidden />
          </Button>
        </DropdownMenuButton>
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => updateEqualizer({ gainsDb: [...PRESETS.flat], preampDb: 0 })}>
          {t.sound.reset}
        </Button>
      </div>

      {/* Frequencies run low → high left to right in every language, like the spectrum. */}
      <div dir="ltr" className={cn("mt-5 flex items-stretch gap-1 transition-opacity", !eq.enabled && "opacity-55")}>
        <BandSlider
          label={t.sound.preamp}
          caption={t.sound.preamp}
          value={eq.preampDb}
          onChange={(preampDb) => updateEqualizer({ preampDb, enabled: true })}
          accent
        />
        <div className="mx-2 w-px self-stretch bg-line" aria-hidden />
        {EQ_BANDS.map((hz, i) => (
          <BandSlider
            key={hz}
            label={t.sound.band(bandLabel(hz))}
            caption={bandLabel(hz)}
            value={eq.gainsDb[i] ?? 0}
            onChange={(v) => {
              const gainsDb = [...eq.gainsDb];
              gainsDb[i] = v;
              updateEqualizer({ gainsDb, enabled: true });
            }}
          />
        ))}
      </div>
      <p className="mt-4 text-caption text-ink-4">{t.sound.clipHint}</p>
    </section>
  );
}

function BandSlider({ label, caption, value, onChange, accent }: { label: string; caption: string; value: number; onChange: (v: number) => void; accent?: boolean }) {
  const t = useT();
  const pct = ((value + EQ_LIMIT_DB) / (2 * EQ_LIMIT_DB)) * 100;
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-2", accent ? "flex-[1.6]" : "flex-1")}>
      <span className="tabular h-4 text-caption text-ink-3">{formatDb(value)}</span>
      <RadixSlider.Root
        orientation="vertical"
        dir="ltr"
        min={-EQ_LIMIT_DB}
        max={EQ_LIMIT_DB}
        step={0.5}
        value={[value]}
        onValueChange={([v = 0]) => onChange(v)}
        className="group relative flex h-40 w-6 touch-none flex-col items-center select-none"
        aria-label={label}
      >
        <RadixSlider.Track className="relative w-1 grow rounded-full bg-white/10">
          {/* Fill from the 0 dB centre line toward the value. */}
          <span
            aria-hidden
            className={cn("absolute inset-x-0 rounded-full", accent ? "bg-ink-2" : "bg-blue-soft")}
            style={value >= 0 ? { bottom: "50%", height: `${pct - 50}%` } : { top: "50%", height: `${50 - pct}%` }}
          />
          <span aria-hidden className="absolute inset-x-[-4px] top-1/2 h-px bg-white/25" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={label}
          aria-valuetext={t.sound.gain(formatDb(value))}
          className="block size-3.5 rounded-full bg-ink shadow-[0_2px_6px_rgb(0_0_0/0.5)] transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue-soft"
          onDoubleClick={() => onChange(0)}
        />
      </RadixSlider.Root>
      <span className="max-w-full truncate text-caption text-ink-4" dir="auto" title={caption}>
        {caption}
      </span>
    </div>
  );
}
