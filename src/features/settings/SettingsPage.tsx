import {
  AlertTriangle,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

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
import { plural } from "@/utils/format";
import { SUPPORTED_FORMAT_LABEL } from "@/utils/formats";
import { ShortcutsTable } from "./ShortcutsDialog";

export function SettingsPage() {
  const prefs = useUi((s) => s.prefs);
  const folders = useLibrary((s) => s.folders);
  const scanning = useLibrary((s) => s.scanning);
  const tracks = useLibrary((s) => s.tracks.length);

  return (
    <Page className="max-w-[880px]">
      <PageHeader title="Settings" />

      <Section
        title="Music library"
        description={`RYLORA indexes ${SUPPORTED_FORMAT_LABEL} files in these folders. Importing and scanning leave your files in place. Song edits are saved in RYLORA unless you choose to write file tags.`}
      >
        {folders.length === 0 ? (
          <div className="flex items-center gap-4 rounded-lg bg-deep p-4 ring-1 ring-line ring-inset">
            <FolderOpen className="size-5 shrink-0 text-ink-3" aria-hidden />
            <p className="flex-1 text-body text-ink-2">No folders yet.</p>
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
                    aria-label="Unavailable"
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
                      ? plural(f.trackCount, "song")
                      : "Not reachable — is the drive connected? Its songs are kept and marked missing."}
                  </p>
                </div>
                <IconButton
                  icon={Trash2}
                  label={`Remove ${f.path}`}
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
            Add folder
          </Button>
          <Button
            icon={RefreshCw}
            onClick={() => void rescanLibrary()}
            disabled={scanning || folders.length === 0}
          >
            {scanning ? "Scanning…" : "Rescan"}
          </Button>
          {scanning && (
            <Button
              variant="ghost"
              onClick={() => void backend().library.cancelScan()}
            >
              Stop scan
            </Button>
          )}
          <span className="ml-auto text-meta text-ink-3">
            {plural(tracks, "song")} indexed
          </span>
        </div>
        <div className="mt-3 border-t border-line pt-1">
          <Switch
            label="Scan for changes on launch"
            description="Picks up new, changed and removed files each time RYLORA starts. Unchanged files are skipped, so it is quick."
            checked={prefEnabled(prefs, "scanOnStartup")}
            onChange={(v) =>
              void setPreference("scanOnStartup", v ? "true" : "false")
            }
          />
          <Switch
            label="Clean up download-site tags"
            description="Removes website addresses, Telegram handles and site names from titles, and repairs garbled Persian text. Only RYLORA's library changes; your music files stay untouched. Switching this re-reads the library."
            checked={prefEnabled(prefs, "cleanTags")}
            onChange={(v) =>
              void setPreference("cleanTags", v ? "true" : "false")
            }
          />
        </div>
      </Section>

      <Section title="Appearance">
        <Row label="Record covers">
          Songs, albums and playlists share a sleeve and disc in every view.
        </Row>
        <div className="flex items-center justify-between gap-6 py-3">
          <div>
            <p className="text-body font-medium text-ink">Motion</p>
            <p className="mt-0.5 text-meta text-ink-3">
              “System” follows Windows’ animation setting.
            </p>
          </div>
          <Segmented
            label="Motion"
            value={prefs.motion ?? "system"}
            onChange={(v) => void setPreference("motion", v)}
            options={[
              { value: "system", label: "System" },
              { value: "reduced", label: "Reduced" },
              { value: "full", label: "Full" },
            ]}
          />
        </div>
        <Switch
          label="Artwork lighting"
          description="Tint Now Playing and Immersive mode with color from the current album art."
          checked={prefEnabled(prefs, "ambientBackground")}
          onChange={(v) =>
            void setPreference("ambientBackground", v ? "true" : "false")
          }
        />
        <Switch
          label="Audio visualizer"
          description="Live spectrum analysed from the audio that is playing. Hidden when motion is reduced."
          checked={prefEnabled(prefs, "visualizer")}
          onChange={(v) =>
            void setPreference("visualizer", v ? "true" : "false")
          }
        />
      </Section>

      <Section title="Playback">
        <Row label="Resume where you left off">
          Your queue, position, volume and repeat mode are restored on launch.
        </Row>
        <Row label="Output">
          Plays through the Windows default audio device. If it changes or
          disconnects, RYLORA reconnects on the next track.
        </Row>
      </Section>

      <Section title="Keyboard shortcuts">
        <ShortcutsTable />
      </Section>

      <Section title="About">
        <div className="flex items-center gap-4">
          <img src={mark} alt="" className="size-12" />
          <div>
            <p className="caps glow text-[15px] tracking-[0.34em]">RYLORA</p>
            <p className="text-meta text-ink-3">
              Version 0.1.0 · Feel every note.
            </p>
          </div>
        </div>
        <p className="mt-4 max-w-[60ch] text-body text-ink-3">
          Offline-first. RYLORA makes no network requests and collects no
          telemetry — your library, playlists and listening history stay on this
          computer.
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
