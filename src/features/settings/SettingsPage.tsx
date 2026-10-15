import {
  AlertTriangle,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  SlidersVertical,
  Trash2,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import mark from "@/assets/brand/mark.svg";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button, IconButton } from "@/components/ui/Button";
import { Segmented, Switch } from "@/components/ui/Controls";
import {
  addFolderInteractive,
  removeFolderInteractive,
  rescanLibrary,
} from "@/features/library/actions";
import { backend } from "@/services/backend";
import { useLibrary } from "@/stores/library";
import { prefEnabled, setPreference, useUi } from "@/stores/ui";
import { usePreferredLanguage, useT } from "@/i18n";
import { ShortcutsTable } from "./ShortcutsDialog";
import { UpdatesSection } from "./UpdatesSection";
import { useUpdates } from "@/stores/updates";
import { PlaybackOptions } from "@/features/sound/PlaybackOptions";
import { OutputDevicePicker } from "@/features/sound/SoundDialog";
import { loadAudioSettings, openSound } from "@/stores/audio";

export function SettingsPage() {
  const t = useT();
  const appVersion = useUpdates((s) => s.status?.currentVersion ?? "");
  const lang = usePreferredLanguage();
  const prefs = useUi((s) => s.prefs);
  const folders = useLibrary((s) => s.folders);
  const scanning = useLibrary((s) => s.scanning);
  const tracks = useLibrary((s) => s.tracks.length);
  useEffect(() => {
    void loadAudioSettings();
  }, []);

  return (
    <Page className="max-w-[880px]">
      <PageHeader title={t.settings.title} />

      <Section title={t.settings.language} description={t.settings.languageHint}>
        <Segmented
          label={t.settings.language}
          value={lang}
          onChange={(v) => void setPreference("language", v)}
          options={[
            { value: "fa", label: "فارسی" },
            { value: "en", label: "English" },
          ]}
        />
      </Section>

      <Section
        title={t.settings.musicLibrary}
        description={t.settings.libraryDescription(t.common.supportedFormats)}
      >
        {folders.length === 0 ? (
          <div className="flex items-center gap-4 rounded-lg bg-deep p-4 ring-1 ring-line ring-inset">
            <FolderOpen className="size-5 shrink-0 text-ink-3" aria-hidden />
            <p className="flex-1 text-body text-ink-2">{t.settings.noFolders}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg bg-deep ring-1 ring-line ring-inset">
            {folders.map((f) => (
              <li key={f.id} className="flex items-center gap-4 px-4 py-3">
                {f.available ? (
                  <FolderOpen
                    className="size-5 shrink-0 text-ink-3"
                    aria-hidden
                  />
                ) : (
                  <AlertTriangle
                    className="size-5 shrink-0 text-warning"
                    aria-label={t.settings.unavailable}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className="selectable truncate text-body font-medium text-ink"
                    title={f.path}
                  >
                    {f.path}
                  </p>
                  <p className="text-meta text-ink-3">
                    {f.available
                      ? t.count.songs(f.trackCount)
                      : t.settings.unreachable}
                  </p>
                </div>
                <IconButton
                  icon={Trash2}
                  label={t.settings.removeNamed(f.path)}
                  size="sm"
                  className="hover:text-danger"
                  onClick={() => void removeFolderInteractive(f)}
                  disabled={scanning}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Button
            variant="primary"
            icon={FolderPlus}
            onClick={() => void addFolderInteractive()}
          >
            {t.settings.addFolder}
          </Button>
          <Button
            icon={RefreshCw}
            onClick={() => void rescanLibrary()}
            disabled={scanning || folders.length === 0}
          >
            {scanning ? t.settings.scanning : t.settings.rescan}
          </Button>
          {scanning && (
            <Button
              variant="ghost"
              onClick={() => void backend().library.cancelScan()}
            >
              {t.settings.stopScan}
            </Button>
          )}
          <span className="ml-auto text-meta text-ink-3">
            {t.settings.indexed(tracks)}
          </span>
        </div>
        <div className="mt-3 border-t border-line pt-1">
          <Switch
            label={t.settings.scanOnLaunch}
            description={t.settings.scanOnLaunchHint}
            checked={prefEnabled(prefs, "scanOnStartup")}
            onChange={(v) =>
              void setPreference("scanOnStartup", v ? "true" : "false")
            }
          />
          <Switch
            label={t.settings.watchFolders}
            description={t.settings.watchFoldersHint}
            checked={prefEnabled(prefs, "watchFolders")}
            onChange={(v) =>
              void setPreference("watchFolders", v ? "true" : "false")
            }
          />
          <Switch
            label={t.settings.cleanTags}
            description={t.settings.cleanTagsHint}
            checked={prefEnabled(prefs, "cleanTags")}
            onChange={(v) =>
              void setPreference("cleanTags", v ? "true" : "false")
            }
          />
        </div>
      </Section>

      <Section title={t.settings.appearance}>
        <Row label={t.settings.recordCovers}>
          {t.settings.recordCoversHint}
        </Row>
        <div className="flex items-center justify-between gap-6 py-3">
          <div>
            <p className="text-body font-medium text-ink">{t.settings.motion}</p>
            <p className="mt-0.5 text-meta text-ink-3">
              {t.settings.motionHint}
            </p>
          </div>
          <Segmented
            label={t.settings.motion}
            value={prefs.motion ?? "system"}
            onChange={(v) => void setPreference("motion", v)}
            options={[
              { value: "system", label: t.settings.motionSystem },
              { value: "reduced", label: t.settings.motionReduced },
              { value: "full", label: t.settings.motionFull },
            ]}
          />
        </div>
        <Switch
          label={t.settings.artworkLighting}
          description={t.settings.artworkLightingHint}
          checked={prefEnabled(prefs, "ambientBackground")}
          onChange={(v) =>
            void setPreference("ambientBackground", v ? "true" : "false")
          }
        />
        <Switch
          label={t.settings.visualizer}
          description={t.settings.visualizerHint}
          checked={prefEnabled(prefs, "visualizer")}
          onChange={(v) =>
            void setPreference("visualizer", v ? "true" : "false")
          }
        />
      </Section>

      <Section title={t.settings.playback}>
        <Row label={t.settings.resume}>
          {t.settings.resumeHint}
        </Row>
      </Section>

      <Section title={t.sound.title}>
        <OutputDevicePicker />
        <div className="mt-5 border-t border-line pt-5">
          <PlaybackOptions />
        </div>
        <Row label={t.sound.gapless}>{t.sound.gaplessHint}</Row>
        <div className="flex items-center justify-between gap-6 py-3">
          <div className="min-w-0">
            <p className="text-body font-medium text-ink">{t.sound.equalizer}</p>
            <p className="mt-0.5 text-meta text-ink-3">{t.sound.equalizerHint}</p>
          </div>
          <Button icon={SlidersVertical} onClick={openSound}>
            {t.sound.openEqualizer}
          </Button>
        </div>
      </Section>

      <Section title={t.settings.shortcuts}>
        <ShortcutsTable />
      </Section>

      <Section title={t.settings.updates}>
        <UpdatesSection />
      </Section>

      <Section title={t.settings.about}>
        <div className="flex items-center gap-4">
          <img src={mark} alt="" className="size-12" />
          <div>
            <p className="caps glow text-[15px] tracking-[0.34em]">RYLORA</p>
            <p className="text-meta text-ink-3">
              {t.app.version(appVersion)} · {t.app.tagline}
            </p>
          </div>
        </div>
        <p className="mt-4 max-w-[60ch] text-body text-ink-3">
          {t.settings.privacy}
        </p>
      </Section>
    </Page>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-12" aria-labelledby={`settings-${title}`}>
      <h2
        id={`settings-${title}`}
        className="font-display text-title font-normal tracking-[-0.01em] text-ink"
      >
        {title}
      </h2>
      {description && (
        <p className="mt-1 mb-4 text-meta text-ink-3">{description}</p>
      )}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-3">
      <p className="text-body font-medium text-ink">{label}</p>
      <p className="mt-0.5 text-meta text-ink-3">{children}</p>
    </div>
  );
}
